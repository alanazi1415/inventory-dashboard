import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    console.log('Admin stats API called')
    
    // Basic counts
    const totalVisits = await db.visitorLog.count().catch(() => 0)

    // حساب زيارات اليوم بناءً على تاريخ اليوم بتوقيت السعودية
    // نستخدم بداية اليوم بتوقيت UTC مع إضافة 3 ساعات للسعودية
    const now = new Date()
    const saudiOffset = 3 * 60 * 60 * 1000
    const saudiNow = new Date(now.getTime() + saudiOffset)
    const saudiStartOfDay = new Date(saudiNow)
    saudiStartOfDay.setUTCHours(0, 0, 0, 0)
    const todayStartUTC = new Date(saudiStartOfDay.getTime() - saudiOffset)

    // نحاول حساب زيارات اليوم، وإذا فشل (عمود createdAt غير موجود) نستخدم الـ total
    let todayVisits = totalVisits
    try {
      todayVisits = await db.visitorLog.count({
        where: { createdAt: { gte: todayStartUTC } }
      })
    } catch (e) {
      console.log('createdAt column not available, using total visits')
    }
    
    // Inventory counts
    const hozItems = await db.inventoryItem.count({ where: { system: 'hoz' } }).catch(() => 0)
    const mwsalItems = await db.inventoryItem.count({ where: { system: 'mwsal' } }).catch(() => 0)
    
    // Hold items
    const hozHoldItems = await db.inventoryItem.count({ where: { system: 'hoz', holdQty: { gt: 0 } } }).catch(() => 0)
    const mwsalHoldItems = await db.inventoryItem.count({ where: { system: 'mwsal', holdQty: { gt: 0 } } }).catch(() => 0)
    
    // Hold Types
    const hozHoldTypes = await db.inventoryItem.groupBy({
      by: ['holdType'],
      where: { system: 'hoz', holdQty: { gt: 0 } },
      _count: { id: true },
      _sum: { holdQty: true }
    }).catch(() => [])

    const mwsalHoldTypes = await db.inventoryItem.groupBy({
      by: ['holdType'],
      where: { system: 'mwsal', holdQty: { gt: 0 } },
      _count: { id: true },
      _sum: { holdQty: true }
    }).catch(() => [])
    
    // Special items counts from lists
    const lifeSavingCount = await db.lifeSavingItem.count().catch(() => 0)
    const narcoticCount = await db.narcoticItem.count().catch(() => 0)
    const vaccineCount = await db.vaccineItem.count().catch(() => 0)
    
    // Items marked as special in inventory
    const lifeSavingInHoz = await db.inventoryItem.count({ where: { system: 'hoz', isLifeSaving: true } }).catch(() => 0)
    const lifeSavingInMwsal = await db.inventoryItem.count({ where: { system: 'mwsal', isLifeSaving: true } }).catch(() => 0)
    
    // Expiry stats
    const hozExpired = await db.inventoryItem.count({ where: { system: 'hoz', daysToExpire: { lte: 0 } } }).catch(() => 0)
    const mwsalExpired = await db.inventoryItem.count({ where: { system: 'mwsal', daysToExpire: { lte: 0 } } }).catch(() => 0)
    const hozExpiring = await db.inventoryItem.count({ where: { system: 'hoz', daysToExpire: { gt: 0, lte: 90 } } }).catch(() => 0)
    const mwsalExpiring = await db.inventoryItem.count({ where: { system: 'mwsal', daysToExpire: { gt: 0, lte: 90 } } }).catch(() => 0)

    // Last upload
    const lastUpload = await db.uploadLog.findFirst({ orderBy: { createdAt: 'desc' } }).catch(() => null)

    const result = {
      totalVisits,
      todayVisits,
      hozItems,
      mwsalItems,
      hozHoldItems,
      mwsalHoldItems,
      hozHoldTypes: hozHoldTypes.map(h => ({
        type: h.holdType || 'غير محدد',
        count: h._count.id,
        qty: h._sum.holdQty || 0
      })),
      mwsalHoldTypes: mwsalHoldTypes.map(h => ({
        type: h.holdType || 'غير محدد',
        count: h._count.id,
        qty: h._sum.holdQty || 0
      })),
      lifeSavingCount,
      narcoticCount,
      vaccineCount,
      lifeSavingInHoz,
      lifeSavingInMwsal,
      hozExpired,
      mwsalExpired,
      hozExpiring,
      mwsalExpiring,
      lastUpload: lastUpload ? {
        fileName: lastUpload.fileName,
        system: lastUpload.system,
        records: lastUpload.recordsCount,
        time: lastUpload.createdAt
      } : null
    }
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    console.error('Admin stats error:', error)
    return NextResponse.json({
      totalVisits: 0,
      todayVisits: 0,
      hozItems: 0,
      mwsalItems: 0,
      hozHoldItems: 0,
      mwsalHoldItems: 0,
      hozHoldTypes: [],
      mwsalHoldTypes: [],
      lifeSavingCount: 0,
      narcoticCount: 0,
      vaccineCount: 0,
      lifeSavingInHoz: 0,
      lifeSavingInMwsal: 0,
      hozExpired: 0,
      mwsalExpired: 0,
      hozExpiring: 0,
      mwsalExpiring: 0,
      lastUpload: null
    })
  }
}
