import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    console.log('Admin stats API called')
    
    // Get total visits
    const totalVisits = await db.visitorLog.count().catch((e) => {
      console.log('VisitorLog error:', e)
      return 0
    })
    
    // Get today's visits
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayVisits = await db.visitorLog.count({
      where: { createdAt: { gte: today } }
    }).catch(() => 0)
    
    // Get item counts
    const hozItems = await db.inventoryItem.count({
      where: { system: 'hoz' }
    }).catch(() => 0)
    
    const mwsalItems = await db.inventoryItem.count({
      where: { system: 'mwsal' }
    }).catch(() => 0)
    
    // Get hold items count
    const hozHoldItems = await db.inventoryItem.count({
      where: { system: 'hoz', holdQty: { gt: 0 } }
    }).catch(() => 0)
    
    const mwsalHoldItems = await db.inventoryItem.count({
      where: { system: 'mwsal', holdQty: { gt: 0 } }
    }).catch(() => 0)
    
    // Get special items counts
    const lifeSavingCount = await db.lifeSavingItem.count().catch(() => 0)
    const narcoticCount = await db.narcoticItem.count().catch(() => 0)
    const vaccineCount = await db.vaccineItem.count().catch(() => 0)
    
    // Get last upload
    const lastUpload = await db.uploadLog.findFirst({
      orderBy: { createdAt: 'desc' }
    }).catch(() => null)

    const result = {
      totalVisits,
      todayVisits,
      hozItems,
      mwsalItems,
      hozHoldItems,
      mwsalHoldItems,
      lifeSavingCount,
      narcoticCount,
      vaccineCount,
      lastUpload: lastUpload ? {
        fileName: lastUpload.fileName,
        system: lastUpload.system,
        records: lastUpload.recordsCount,
        time: lastUpload.createdAt
      } : null
    }
    
    console.log('Admin stats result:', result)
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
      lifeSavingCount: 0,
      narcoticCount: 0,
      vaccineCount: 0,
      lastUpload: null
    })
  }
}
