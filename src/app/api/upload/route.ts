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
    // Try different date formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/, // 2026-10-10
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // 10/10/2026
    ]
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
    console.log('Sample row:', (data as any[])[0])

    if (system === 'hoz' || system === 'mwsal') {
      // Delete old data
      await db.inventoryItem.deleteMany({ where: { system } })

      // Get special items lists
      const [lifeSaving, narcotic, vaccine] = await Promise.all([
        db.lifeSavingItem.findMany().catch(() => []),
        db.narcoticItem.findMany().catch(() => []),
        db.vaccineItem.findMany().catch(() => [])
      ])

      // Create sets for quick lookup - check both Generic and Customer codes
      const lsGenericSet = new Set(lifeSaving.map(i => i.itemNumber).filter(Boolean))
      const lsCustomerSet = new Set(lifeSaving.map(i => i.customerCode).filter(Boolean))
      const nGenericSet = new Set(narcotic.map(i => i.itemNumber).filter(Boolean))
      const nCustomerSet = new Set(narcotic.map(i => i.customerCode).filter(Boolean))
      const vGenericSet = new Set(vaccine.map(i => i.itemNumber).filter(Boolean))
      const vCustomerSet = new Set(vaccine.map(i => i.customerCode).filter(Boolean))

      const items = (data as any[]).map(row => {
        // Get values with multiple possible column names
        const genericNum = row['Generic Item Number']?.toString() || ''
        const tradeNum = row['Trade Item Number']?.toString() || ''
        const customerCode = row['Customer Item Code']?.toString() || 
                            row['Customer Item Number']?.toString() || ''
        
        // Get quantities
        const totalQty = parseFloat(row['Total Qty']) || 0
        const availQty = parseFloat(row['Avail Qty'] || row['Available Qty']) || 0
        
        // Handle Hold - can be YES/NO string or numeric quantity
        const holdValue = row['Hold']
        let holdQty = 0
        let hasHold = false
        if (typeof holdValue === 'string') {
          hasHold = holdValue.toUpperCase() === 'YES'
          holdQty = hasHold ? totalQty - availQty : 0
        } else {
          holdQty = parseFloat(holdValue) || parseFloat(row['Hold Qty']) || 0
          hasHold = holdQty > 0
        }

        // Get expiry date (BBD = Best Before Date)
        const bbd = row['BBD'] || row['Expiry Date']
        const expiryDate = formatDate(bbd)
        const daysToExpire = calculateDaysFromBBD(bbd)

        // Check if life saving / narcotic / vaccine (check both generic and customer codes)
        const isLifeSaving = lsGenericSet.has(genericNum) || lsCustomerSet.has(customerCode) ||
                            lsGenericSet.has(tradeNum)
        const isNarcotic = nGenericSet.has(genericNum) || nCustomerSet.has(customerCode) ||
                          nGenericSet.has(tradeNum)
        const isVaccine = vGenericSet.has(genericNum) || vCustomerSet.has(customerCode) ||
                         vGenericSet.has(tradeNum)

        return {
          system,
          genericItemNumber: genericNum || null,
          genericItemDescription: row['Generic Item description']?.toString() || 
                                  row['Generic Item Description']?.toString() || null,
          tradeItemNumber: tradeNum || null,
          customerItemNumber: customerCode || null,
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
      await db.lifeSavingItem.deleteMany().catch(() => {})
      
      const items = (data as any[])
        .map(row => {
          const genericNum = row['Generic Item Number']?.toString()
          const customerCode = row['Customer Item Code']?.toString() || 
                              row['Customer Item Number']?.toString()
          return {
            itemNumber: genericNum || null,
            customerCode: customerCode || null,
          }
        })
        .filter(i => i.itemNumber || i.customerCode)
      
      if (items.length > 0) {
        await db.lifeSavingItem.createMany({ data: items })
      }
      recordsCount = items.length

    } else if (system === 'narcotic') {
      await db.narcoticItem.deleteMany().catch(() => {})
      
      const items = (data as any[])
        .map(row => {
          const genericNum = row['Generic Item Number']?.toString()
          const customerCode = row['Customer Item Code']?.toString() || 
                              row['Customer Item Number']?.toString()
          return {
            itemNumber: genericNum || null,
            customerCode: customerCode || null,
          }
        })
        .filter(i => i.itemNumber || i.customerCode)
      
      if (items.length > 0) {
        await db.narcoticItem.createMany({ data: items })
      }
      recordsCount = items.length

    } else if (system === 'vaccine') {
      await db.vaccineItem.deleteMany().catch(() => {})
      
      const items = (data as any[])
        .map(row => {
          const genericNum = row['Generic Item Number']?.toString()
          const customerCode = row['Customer Item Code']?.toString() || 
                              row['Customer Item Number']?.toString()
          return {
            itemNumber: genericNum || null,
            customerCode: customerCode || null,
          }
        })
        .filter(i => i.itemNumber || i.customerCode)
      
      if (items.length > 0) {
        await db.vaccineItem.createMany({ data: items })
      }
      recordsCount = items.length
    }

    // Log the upload
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
