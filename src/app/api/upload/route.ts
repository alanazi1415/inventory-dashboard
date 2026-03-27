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

function calculateDays(expiryStr: string | null, excelDays: any): number {
  if (excelDays !== undefined && excelDays !== null && excelDays !== '') {
    const d = parseFloat(excelDays)
    if (!isNaN(d) && d > -365 && d < 3650) return d
  }
  if (!expiryStr) return 999
  const expiry = parseExcelDate(expiryStr)
  if (!expiry) return 999
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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

      // Get special items
      const [lifeSaving, narcotic, vaccine] = await Promise.all([
        db.lifeSavingItem.findMany().catch(() => []),
        db.narcoticItem.findMany().catch(() => []),
        db.vaccineItem.findMany().catch(() => [])
      ])

      const lsSet = new Set(lifeSaving.map(i => i.itemNumber))
      const nSet = new Set(narcotic.map(i => i.itemNumber))
      const vSet = new Set(vaccine.map(i => i.itemNumber))

      const items = (data as any[]).map(row => {
        const gen = row['Generic Item Number']?.toString() || ''
        const trade = row['Trade Item Number']?.toString() || ''
        const cust = row['Customer Item Number']?.toString() || ''
        const expiryStr = row['Expiry Date']?.toString() || null

        return {
          system,
          genericItemNumber: gen || null,
          genericItemDescription: row['Generic Item Description']?.toString() || null,
          tradeItemNumber: trade || null,
          customerItemNumber: cust || null,
          totalQty: parseFloat(row['Total Qty']) || 0,
          holdQty: parseFloat(row['Hold Qty']) || 0,
          availableQty: parseFloat(row['Available Qty']) || 0,
          expiryDate: expiryStr,
          daysToExpire: calculateDays(expiryStr, row['Days to Expire']),
          isLifeSaving: lsSet.has(gen) || lsSet.has(trade) || lsSet.has(cust),
          isNarcotic: nSet.has(gen) || nSet.has(trade) || nSet.has(cust),
          isVaccine: vSet.has(gen) || vSet.has(trade) || vSet.has(cust),
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
        .map(r => ({
          itemNumber: r['Generic Item Number']?.toString() || 
                     r['Item Number']?.toString() || 
                     Object.values(r)[0]?.toString()
        }))
        .filter(i => i.itemNumber)
      
      if (items.length > 0) {
        await db.lifeSavingItem.createMany({ data: items })
      }
      recordsCount = items.length

    } else if (system === 'narcotic') {
      await db.narcoticItem.deleteMany().catch(() => {})
      const items = (data as any[])
        .map(r => ({
          itemNumber: r['Generic Item Number']?.toString() || 
                     r['Item Number']?.toString() || 
                     Object.values(r)[0]?.toString()
        }))
        .filter(i => i.itemNumber)
      
      if (items.length > 0) {
        await db.narcoticItem.createMany({ data: items })
      }
      recordsCount = items.length

    } else if (system === 'vaccine') {
      await db.vaccineItem.deleteMany().catch(() => {})
      const items = (data as any[])
        .map(r => ({
          itemNumber: r['Generic Item Number']?.toString() || 
                     r['Item Number']?.toString() || 
                     Object.values(r)[0]?.toString()
        }))
        .filter(i => i.itemNumber)
      
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
