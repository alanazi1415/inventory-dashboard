import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as xlsx from 'xlsx'

export const dynamic = 'force-dynamic'

function parseExcelDate(value: any): Date | null {
  if (!value) return null
  if (typeof value === 'number') {
    const d = new Date(1899, 11, 30)
    return new Date(d.getTime() + value * 24 * 60 * 60 * 1000)
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return parsed
  }
  return null
}

function calculateDaysFromBBD(bbd: any): number {
  if (!bbd) return 999
  const expiry = parseExcelDate(bbd)
  if (!expiry) return 999
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(bbd: any): string | null {
  if (!bbd) return null
  const date = parseExcelDate(bbd)
  if (!date) return bbd?.toString() || null
  return date.toISOString().split('T')[0]
}

function safeString(value: any): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

async function parseExcel(buffer: Buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName])
}

async function checkAuth() {
  try {
    const cookieStore = await import('next/headers').then(m => m.cookies())
    const cookies = await cookieStore
    return !!cookies.get('admin_session')?.value
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const isAuth = await checkAuth()
    if (!isAuth) {
      return NextResponse.json({ error: 'غير مصرح لك بالوصول' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const system = formData.get('system') as string

    if (!file || !system) {
      return NextResponse.json({ error: 'الملف والنظام مطلوبان' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const data = await parseExcel(buffer)
    let recordsCount = 0

    console.log('Upload started:', { system, fileName: file.name, rows: (data as any[]).length })

    if (system === 'hoz' || system === 'mwsal') {
      // Delete old data for this system
      await db.inventoryItem.deleteMany({ where: { system } })

      // Get special items lists
      const [lifeSaving, narcotic, vaccine] = await Promise.all([
        db.lifeSavingItem.findMany().catch(() => []),
        db.narcoticItem.findMany().catch(() => []),
        db.vaccineItem.findMany().catch(() => [])
      ])

      // Create lookup sets
      const lifeSavingSet = new Set(lifeSaving.map(i => i.itemNumber))
      const narcoticSet = new Set(narcotic.map(i => i.itemNumber))
      const vaccineSet = new Set(vaccine.map(i => i.itemNumber))

      const items = (data as any[]).map(row => {
        const genericNum = safeString(row['Generic Item Number'])
        const tradeNum = safeString(row['Trade Item Number'])
        const customerCode = safeString(row['Customer Item Code'])
        
        const totalQty = parseFloat(row['Total Qty']) || 0
        const availQty = parseFloat(row['Avail Qty']) || 0
        
        const holdValue = safeString(row['Hold'])
        const holdType = safeString(row['Hold Type'])
        const isOnHold = holdValue?.toUpperCase() === 'YES'
        const holdQty = isOnHold ? (totalQty - availQty > 0 ? totalQty - availQty : totalQty) : 0

        const bbd = row['BBD']
        const expiryDate = formatDate(bbd)
        const daysToExpire = calculateDaysFromBBD(bbd)

        // Check if item is in special lists (by generic number or customer code)
        const isLifeSaving = lifeSavingSet.has(genericNum || '') || 
                            lifeSavingSet.has(customerCode || '') ||
                            lifeSavingSet.has(tradeNum || '')
        const isNarcotic = narcoticSet.has(genericNum || '') || 
                          narcoticSet.has(customerCode || '') ||
                          narcoticSet.has(tradeNum || '')
        const isVaccine = vaccineSet.has(genericNum || '') || 
                         vaccineSet.has(customerCode || '') ||
                         vaccineSet.has(tradeNum || '')

        return {
          system,
          genericItemNumber: genericNum,
          genericItemDescription: safeString(row['Generic Item description']),
          tradeItemNumber: tradeNum,
          customerItemNumber: customerCode,
          totalQty,
          holdQty,
          availableQty: availQty,
          expiryDate,
          daysToExpire,
          hold: holdValue,
          holdType: isOnHold ? holdType : null,
          isLifeSaving,
          isNarcotic,
          isVaccine,
        }
      })

      // Insert in batches
      const batchSize = 500
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        await db.inventoryItem.createMany({ data: batch })
      }
      recordsCount = items.length

    } else if (system === 'life_saving') {
      await db.lifeSavingItem.deleteMany()
      
      const rows = data as any[]
      const insertedItems = new Set<string>()
      
      for (const row of rows) {
        const genericNum = safeString(row['Generic Item Number'])
        const customerCode = safeString(row['Customer Item Code'])
        
        // Store both Generic Item Number and Customer Code
        if (genericNum && !insertedItems.has(genericNum)) {
          await db.lifeSavingItem.create({ data: { itemNumber: genericNum } })
          insertedItems.add(genericNum)
          recordsCount++
        }
        if (customerCode && !insertedItems.has(customerCode)) {
          await db.lifeSavingItem.create({ data: { itemNumber: customerCode } })
          insertedItems.add(customerCode)
        }
      }

      // Update matching inventory items
      const allNumbers = Array.from(insertedItems)
      if (allNumbers.length > 0) {
        await db.inventoryItem.updateMany({
          where: {
            OR: [
              { genericItemNumber: { in: allNumbers } },
              { customerItemNumber: { in: allNumbers } },
              { tradeItemNumber: { in: allNumbers } }
            ]
          },
          data: { isLifeSaving: true }
        })
      }

    } else if (system === 'narcotic') {
      await db.narcoticItem.deleteMany()
      
      const rows = data as any[]
      const insertedItems = new Set<string>()
      
      for (const row of rows) {
        const genericNum = safeString(row['Generic Item Number'])
        const customerCode = safeString(row['Customer Item Code'])
        
        if (genericNum && !insertedItems.has(genericNum)) {
          await db.narcoticItem.create({ data: { itemNumber: genericNum } })
          insertedItems.add(genericNum)
          recordsCount++
        }
        if (customerCode && !insertedItems.has(customerCode)) {
          await db.narcoticItem.create({ data: { itemNumber: customerCode } })
          insertedItems.add(customerCode)
        }
      }

      const allNumbers = Array.from(insertedItems)
      if (allNumbers.length > 0) {
        await db.inventoryItem.updateMany({
          where: {
            OR: [
              { genericItemNumber: { in: allNumbers } },
              { customerItemNumber: { in: allNumbers } },
              { tradeItemNumber: { in: allNumbers } }
            ]
          },
          data: { isNarcotic: true }
        })
      }

    } else if (system === 'vaccine') {
      await db.vaccineItem.deleteMany()
      
      const rows = data as any[]
      const insertedItems = new Set<string>()
      
      for (const row of rows) {
        const genericNum = safeString(row['Generic Item Number'])
        const customerCode = safeString(row['Customer Item Code'])
        
        if (genericNum && !insertedItems.has(genericNum)) {
          await db.vaccineItem.create({ data: { itemNumber: genericNum } })
          insertedItems.add(genericNum)
          recordsCount++
        }
        if (customerCode && !insertedItems.has(customerCode)) {
          await db.vaccineItem.create({ data: { itemNumber: customerCode } })
          insertedItems.add(customerCode)
        }
      }

      const allNumbers = Array.from(insertedItems)
      if (allNumbers.length > 0) {
        await db.inventoryItem.updateMany({
          where: {
            OR: [
              { genericItemNumber: { in: allNumbers } },
              { customerItemNumber: { in: allNumbers } },
              { tradeItemNumber: { in: allNumbers } }
            ]
          },
          data: { isVaccine: true }
        })
      }
    }

    // Log upload
    await db.uploadLog.create({ 
      data: { fileName: file.name, system, recordsCount } 
    }).catch(() => {})

    console.log('Upload completed:', { system, recordsCount })

    return NextResponse.json({ 
      success: true, 
      message: `تم رفع ${recordsCount} سجل بنجاح`,
      recordsCount 
    })

  } catch (e: any) {
    console.error('Upload error:', e)
    return NextResponse.json({ 
      error: 'حدث خطأ أثناء رفع الملف', 
      details: e.message 
    }, { status: 500 })
  }
}
