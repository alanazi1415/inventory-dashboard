import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as xlsx from 'xlsx'

export const dynamic = 'force-dynamic'

function parseExcelDate(value: any): Date | null {
  if (!value) return null
  if (typeof value === 'number') { const d = new Date(1899, 11, 30); return new Date(d.getTime() + value * 24 * 60 * 60 * 1000) }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return parsed
  }
  return null
}

function calculateDays(expiryStr: string | null, excelDays: any): number {
  if (excelDays !== undefined && excelDays !== null && excelDays !== '') { const d = parseFloat(excelDays); if (!isNaN(d) && d > -365 && d < 3650) return d }
  if (!expiryStr) return 999
  const expiry = parseExcelDate(expiryStr)
  if (!expiry) return 999
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

async function parseExcel(buffer: Buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' })
  return xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
}

async function checkAuth() {
  const cookieStore = await import('next/headers').then(m => m.cookies())
  return !!(await cookieStore).get('admin_session')?.value
}

export async function POST(request: NextRequest) {
  try {
    if (!await checkAuth()) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const formData = await request.formData()
    const file = formData.get('file') as File
    const system = formData.get('system') as string
    if (!file || !system) return NextResponse.json({ error: 'الملف والنظام مطلوبان' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const data = await parseExcel(buffer)
    let recordsCount = 0

    if (system === 'hoz' || system === 'mwsal') {
      await db.inventoryItem.deleteMany({ where: { system } })
      const [lifeSaving, narcotic, vaccine] = await Promise.all([
        db.lifeSavingItem.findMany(),
        db.narcoticItem.findMany(),
        db.vaccineItem.findMany()
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

      for (let i = 0; i < items.length; i += 500) {
        await db.inventoryItem.createMany({ data: items.slice(i, i + 500) })
      }
      recordsCount = items.length
    } else if (system === 'life_saving') {
      await db.lifeSavingItem.deleteMany()
      const items = (data as any[]).map(r => ({ itemNumber: r['Generic Item Number']?.toString() || Object.values(r)[0]?.toString() })).filter(i => i.itemNumber)
      if (items.length) await db.lifeSavingItem.createMany({ data: items })
      recordsCount = items.length
    } else if (system === 'vaccine') {
      await db.vaccineItem.deleteMany()
      const items = (data as any[]).map(r => ({ itemNumber: r['Generic Item Number']?.toString() || Object.values(r)[0]?.toString() })).filter(i => i.itemNumber)
      if (items.length) await db.vaccineItem.createMany({ data: items })
      recordsCount = items.length
    }

    await db.uploadLog.create({ data: { fileName: file.name, system, recordsCount } })
    return NextResponse.json({ success: true, message: تم رفع {recordsCount} سجل بنجاح, recordsCount })
  } catch (e: any) { return NextResponse.json({ error: 'حدث خطأ', details: e.message }, { status: 500 }) }
}
