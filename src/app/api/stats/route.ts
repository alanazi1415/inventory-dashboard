import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const system = searchParams.get('system') || 'hoz'

    console.log('Stats API called for system:', system)

    // Basic counts
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

    // Aggregated quantities
    const totalQty = await db.inventoryItem.aggregate({
      where: { system },
      _sum: { totalQty: true, availableQty: true, holdQty: true }
    })

    // Hold Types distribution
    const holdTypes = await db.inventoryItem.groupBy({
      by: ['holdType'],
      where: { system, holdQty: { gt: 0 } },
      _count: { id: true },
      _sum: { holdQty: true }
    })

    // Expiry distribution
    const expiryDistribution = {
      expired: await db.inventoryItem.count({ where: { system, daysToExpire: { lte: 0 } } }),
      oneMonth: await db.inventoryItem.count({ where: { system, daysToExpire: { gt: 0, lte: 30 } } }),
      threeMonths: await db.inventoryItem.count({ where: { system, daysToExpire: { gt: 30, lte: 90 } } }),
      sixMonths: await db.inventoryItem.count({ where: { system, daysToExpire: { gt: 90, lte: 180 } } }),
      oneYear: await db.inventoryItem.count({ where: { system, daysToExpire: { gt: 180, lte: 365 } } }),
      overYear: await db.inventoryItem.count({ where: { system, daysToExpire: { gt: 365 } } }),
    }

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
      holdTypes: holdTypes.map(h => ({
        type: h.holdType || 'غير محدد',
        count: h._count.id,
        qty: h._sum.holdQty || 0
      })),
      expiryDistribution
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
      holdTypes: [],
      expiryDistribution: { expired: 0, oneMonth: 0, threeMonths: 0, sixMonths: 0, oneYear: 0, overYear: 0 }
    })
  }
}
