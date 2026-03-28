import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { page, system } = body
    console.log('Visitor API called:', { page, system })
    
    const result = await db.visitorLog.create({
      data: { page: page || 'unknown', system: system || null }
    })
    console.log('Visitor logged:', result.id)
    
    return NextResponse.json({ success: true, id: result.id })
  } catch (error: any) {
    console.error('Visitor API error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
