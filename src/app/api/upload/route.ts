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
  
  const diffTime = expiry.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  return diffDays
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
      // Delete old data
      await db.inventoryItem.deleteMany({ where: { system } })

      // Get special items lists
      const [lifeSaving, narcotic, vaccine] = await Promise.all([
        db.lifeSavingItem.findMany().catch(() => []),
        db.narcoticItem.findMany().catch(() => []),
        db.vaccineItem.findMany().catch(() => [])
      ])

      // Create lookup maps
      const lifeSavingMap = new Map<string, boolean>()
      const narcoticMap = new Map<string, boolean>()
      const vaccineMap = new Map<string, boolean>()
      
      lifeSaving.forEach(item => {
        if (item.itemNumber) lifeSavingMap.set(item.itemNumber, true)
        if (item.customerCode) lifeSavingMap.set(item.customerCode, true)
      })
      narcotic.forEach(item => {
        if (item.itemNumber) narcoticMap.set(item.itemNumber, true)
        if (item.customerCode) narcoticMap.set(item.customerCode, true)
      })
      vaccine.forEach(item => {
        if (item.itemNumber) vaccineMap.set(item.itemNumber, true)
        if (item.customerCode) vaccineMap.set(item.customerCode, true)
      })

      const items = (data as any[]).map(row => {
        // Get item numbers
        const genericNum = safeString(row['Generic Item Number'])
        const tradeNum = safeString(row['Trade Item Number'])
        const customerCode = safeString(row['Customer Item Code'] || row['Customer Item Number'])
        
        // Get quantities
        const totalQty = parseFloat(row['Total Qty']) || 0
        const availQty = parseFloat(row['Avail Qty'] || row['Available Qty']) || 0
        
        // Calculate Hold Qty
        const holdValue = row['Hold']
        let holdQty = 0
        if (typeof holdValue === 'string' && holdValue.toUpperCase() === 'YES') {
          holdQty = totalQty - availQty
          if (holdQty < 0) holdQty = totalQty // Fallback
        } else {
          holdQty = parseFloat(holdValue) || parseFloat(row['Hold Qty']) || 0
        }

        // Get expiry date
        const bbd = row['BBD'] || row['Expiry Date']
        const expiryDate = formatDate(bbd)
        const daysToExpire = calculateDaysFromBBD(bbd)

        // Check special categories
        const isLifeSaving = lifeSavingMap.has(genericNum || '') || 
                            lifeSavingMap.has(customerCode || '') ||
                            lifeSavingMap.has(tradeNum || '')
        const isNarcotic = narcoticMap.has(genericNum || '') || 
                          narcoticMap.has(customerCode || '') ||
                          narcoticMap.has(tradeNum || '')
        const isVaccine = vaccineMap.has(genericNum || '') || 
                         vaccineMap.has(customerCode || '') ||
                         vaccineMap.has(tradeNum || '')

        return {
          system,
          genericItemNumber: genericNum,
          genericItemDescription: safeString(row['Generic Item description'] || row['Generic Item Description']),
          tradeItemNumber: tradeNum,
          customerItemNumber: customerCode,
          totalQty,
          holdQty,
          availableQty: availQty,
          expiryDate,
          daysToExpire,
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
      // Delete old data
      await db.lifeSavingItem.deleteMany().catch(() => {})
      
      const items = (data as any[])
        .map(row => {
          const genericNum = safeString(row['Generic Item Number'])
          const customerCode = safeString(row['Customer Item Code'] || row['Customer Item Number'])
          
          if (!genericNum && !customerCode) return null
          
          return {
            itemNumber: genericNum,
            customerCode: customerCode,
          }
        })
        .filter(Boolean) as { itemNumber: string; customerCode: string | null }[]
      
      if (items.length > 0) {
        // Insert one by one to handle duplicates
        for (const item of items) {
          try {
            await db.lifeSavingItem.create({ data: item })
          } catch (e) {
            // Skip duplicates
          }
        }
      }
      recordsCount = items.length

    } else if (system === 'narcotic') {
      await db.narcoticItem.deleteMany().catch(() => {})
      
      const items = (data as any[])
        .map(row => {
          const genericNum = safeString(row['Generic Item Number'])
          const customerCode = safeString(row['Customer Item Code'] || row['Customer Item Number'])
          
          if (!genericNum && !customerCode) return null
          
          return {
            itemNumber: genericNum,
            customerCode: customerCode,
          }
        })
        .filter(Boolean) as { itemNumber: string; customerCode: string | null }[]
      
      if (items.length > 0) {
        for (const item of items) {
          try {
            await db.narcoticItem.create({ data: item })
          } catch (e) {}
        }
      }
      recordsCount = items.length

    } else if (system === 'vaccine') {
      await db.vaccineItem.deleteMany().catch(() => {})
      
      const items = (data as any[])
        .map(row => {
          const genericNum = safeString(row['Generic Item Number'])
          const customerCode = safeString(row['Customer Item Code'] || row['Customer Item Number'])
          
          if (!genericNum && !customerCode) return null
          
          return {
            itemNumber: genericNum,
            customerCode: customerCode,
          }
        })
        .filter(Boolean) as { itemNumber: string; customerCode: string | null }[]
      
      if (items.length > 0) {
        for (const item of items) {
          try {
            await db.vaccineItem.create({ data: item })
          } catch (e) {}
        }
      }
      recordsCount = items.length
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
