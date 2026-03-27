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

      // Create lookup maps for special items
      const lifeSavingSet = new Set<string>()
      const narcoticSet = new Set<string>()
      const vaccineSet = new Set<string>()
      
      lifeSaving.forEach(item => {
        if (item.itemNumber) lifeSavingSet.add(item.itemNumber)
        if (item.customerCode) lifeSavingSet.add(item.customerCode)
      })
      narcotic.forEach(item => {
        if (item.itemNumber) narcoticSet.add(item.itemNumber)
        if (item.customerCode) narcoticSet.add(item.customerCode)
      })
      vaccine.forEach(item => {
        if (item.itemNumber) vaccineSet.add(item.itemNumber)
        if (item.customerCode) vaccineSet.add(item.customerCode)
      })

      const items = (data as any[]).map(row => {
        // Get item numbers
        const genericNum = safeString(row['Generic Item Number'])
        const tradeNum = safeString(row['Trade Item Number'])
        const customerCode = safeString(row['Customer Item Code'])
        
        // Get quantities
        const totalQty = parseFloat(row['Total Qty']) || 0
        const availQty = parseFloat(row['Avail Qty']) || 0
        
        // Get Hold info
        const holdValue = safeString(row['Hold'])
        const holdType = safeString(row['Hold Type'])
        const isOnHold = holdValue?.toUpperCase() === 'YES'
        const holdQty = isOnHold ? (totalQty - availQty > 0 ? totalQty - availQty : totalQty) : 0

        // Get expiry date
        const bbd = row['BBD']
        const expiryDate = formatDate(bbd)
        const daysToExpire = calculateDaysFromBBD(bbd)

        // Check special categories
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
      // Delete old life saving items
      await db.lifeSavingItem.deleteMany().catch(() => {})
      
      const items = (data as any[])
        .map(row => {
          const genericNum = safeString(row['Generic Item Number'])
          const customerCode = safeString(row['Customer Item Code'])
          
          if (!genericNum && !customerCode) return null
          
          return {
            itemNumber: genericNum,
            customerCode: customerCode,
          }
        })
        .filter(Boolean) as { itemNumber: string | null; customerCode: string | null }[]
      
      if (items.length > 0) {
        await db.lifeSavingItem.createMany({ data: items })
      }
      recordsCount = items.length

      // Update existing inventory items
      const itemNumbers = items.filter(i => i.itemNumber).map(i => i.itemNumber)
      const customerCodes = items.filter(i => i.customerCode).map(i => i.customerCode)
      
      // Mark matching items as life saving
      await db.inventoryItem.updateMany({
        where: {
          OR: [
            { genericItemNumber: { in: itemNumbers as string[] } },
            { customerItemNumber: { in: customerCodes as string[] } },
            { tradeItemNumber: { in: itemNumbers as string[] } }
          ]
        },
        data: { isLifeSaving: true }
      })

    } else if (system === 'narcotic') {
      await db.narcoticItem.deleteMany().catch(() => {})
      
      const items = (data as any[])
        .map(row => {
          const genericNum = safeString(row['Generic Item Number'])
          const customerCode = safeString(row['Customer Item Code'])
          if (!genericNum && !customerCode) return null
          return { itemNumber: genericNum, customerCode: customerCode }
        })
        .filter(Boolean) as { itemNumber: string | null; customerCode: string | null }[]
      
      if (items.length > 0) {
        await db.narcoticItem.createMany({ data: items })
      }
      recordsCount = items.length

      const itemNumbers = items.filter(i => i.itemNumber).map(i => i.itemNumber)
      const customerCodes = items.filter(i => i.customerCode).map(i => i.customerCode)
      
      await db.inventoryItem.updateMany({
        where: {
          OR: [
            { genericItemNumber: { in: itemNumbers as string[] } },
            { customerItemNumber: { in: customerCodes as string[] } },
            { tradeItemNumber: { in: itemNumbers as string[] } }
          ]
        },
        data: { isNarcotic: true }
      })

    } else if (system === 'vaccine') {
      await db.vaccineItem.deleteMany().catch(() => {})
      
      const items = (data as any[])
        .map(row => {
          const genericNum = safeString(row['Generic Item Number'])
          const customerCode = safeString(row['Customer Item Code'])
          if (!genericNum && !customerCode) return null
          return { itemNumber: genericNum, customerCode: customerCode }
        })
        .filter(Boolean) as { itemNumber: string | null; customerCode: string | null }[]
      
      if (items.length > 0) {
        await db.vaccineItem.createMany({ data: items })
      }
      recordsCount = items.length

      const itemNumbers = items.filter(i => i.itemNumber).map(i => i.itemNumber)
      const customerCodes = items.filter(i => i.customerCode).map(i => i.customerCode)
      
      await db.inventoryItem.updateMany({
        where: {
          OR: [
            { genericItemNumber: { in: itemNumbers as string[] } },
            { customerItemNumber: { in: customerCodes as string[] } },
            { tradeItemNumber: { in: itemNumbers as string[] } }
          ]
        },
        data: { isVaccine: true }
      })
    }

    // Log the upload
    try {
      await db.uploadLog.create({ 
        data: { fileName: file.name, system, recordsCount } 
      })
    } catch (e) {}

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
