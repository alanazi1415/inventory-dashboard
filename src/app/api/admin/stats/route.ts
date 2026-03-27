import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Get total visits
    const totalVisits = await db.visitorLog.count()
    
    // Get today's visits
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayVisits = await db.visitorLog.count({
      where: {
        createdAt: { gte: today }
      }
    })
    
    // Get item counts
    const hozItems = await db.inventoryItem.count({
      where: { system: 'hoz' }
    })
    
    const mwsalItems = await db.inventoryItem.count({
      where: { system: 'mwsal' }
    })
    
    // Get last upload
    const lastUpload = await db.uploadLog.findFirst({
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      totalVisits,
      todayVisits,
      hozItems,
      mwsalItems,
      lastUpload: lastUpload ? {
        fileName: lastUpload.fileName,
        system: lastUpload.system,
        records: lastUpload.recordsCount,
        time: lastUpload.createdAt
      } : null
    })
  } catch (error: any) {
    console.error('Admin stats error:', error)
    return NextResponse.json({
      totalVisits: 0,
      todayVisits: 0,
      hozItems: 0,
      mwsalItems: 0,
      lastUpload: null
    })
  }
}
