import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const system = searchParams.get('system') || 'hoz'

    console.log('Stats API called for system:', system)

    const [
      totalItems,
      expiredItems,
      expiringItems,
      holdItems,
      lifeSavingItems,
      narcoticItems,
      vaccineItems
    ] = await Promise.all([
      db.inventoryItem.count({ where: { system } }),
      db.inventoryItem.count({ where: { system, daysToExpire: { lte: 0 } } }),
      db.inventoryItem.count({ where: { system, daysToExpire: { gt: 0, lte: 90 } } }),
      db.inventoryItem.count({ where: { system, holdQty: { gt: 0 } } }),
      db.inventoryItem.count({ where: { system, isLifeSaving: true } }),
      db.inventoryItem.count({ where: { system, isNarcotic: true } }),
      db.inventoryItem.count({ where: { system, isVaccine: true } }),
    ])

    const totalQty = await db.inventoryItem.aggregate({
      where: { system },
      _sum: { totalQty: true, availableQty: true, holdQty: true }
    })

    console.log('Stats result:', { 
      totalItems, expiredItems, expiringItems, holdItems, 
      totalQty: totalQty._sum 
    })

    return NextResponse.json({
      totalItems,
      expiredItems,
      expiringItems,
      holdItems,
      lifeSavingItems,
      narcoticItems,
      vaccineItems,
      totalQty: totalQty._sum.totalQty || 0,
      availableQty: totalQty._sum.availableQty || 0,
      holdQtySum: totalQty._sum.holdQty || 0,
    })
  } catch (error: any) {
    console.error('Stats error:', error)
    return NextResponse.json({
      totalItems: 0,
      expiredItems: 0,
      expiringItems: 0,
      holdItems: 0,
      lifeSavingItems: 0,
      narcoticItems: 0,
      vaccineItems: 0,
      totalQty: 0,
      availableQty: 0,
      holdQtySum: 0,
    })
  }
}
