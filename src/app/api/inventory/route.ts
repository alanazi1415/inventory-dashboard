import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const system = searchParams.get('system') || 'hoz'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || 'all'
    const sortBy = searchParams.get('sortBy') || 'daysToExpire'
    const sortOrder = searchParams.get('sortOrder') || 'asc'

    const skip = (page - 1) * limit
    const where: Prisma.InventoryItemWhereInput = { system }

    if (search) {
      where.OR = [
        { genericItemNumber: { contains: search } },
        { genericItemDescription: { contains: search } },
        { tradeItemNumber: { contains: search } },
        { customerItemNumber: { contains: search } },
      ]
    }

    switch (category) {
      case 'expired': where.daysToExpire = { lte: 0 }; break
      case 'expiring': where.daysToExpire = { gt: 0, lte: 90 }; break
      case 'hold': where.holdQty = { gt: 0 }; break
      case 'life_saving': where.isLifeSaving = true; break
      case 'narcotic': where.isNarcotic = true; break
      case 'vaccine': where.isVaccine = true; break
    }

    const orderBy: any = {}
    orderBy[sortBy] = sortOrder

    const [items, total] = await Promise.all([
      db.inventoryItem.findMany({ where, orderBy, skip, take: limit }),
      db.inventoryItem.count({ where })
    ])

    return NextResponse.json({
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    })
  } catch (error: any) {
    console.error('Inventory error:', error)
    return NextResponse.json({ error: 'حدث خطأ', details: error.message }, { status: 500 })
  }
}
