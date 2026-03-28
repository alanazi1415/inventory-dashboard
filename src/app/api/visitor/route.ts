import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { page, system } = body
    console.log('Visitor API called:', { page, system })

    // أولاً نكتشف هيكل الجدول
    const columns = await db.$queryRaw<any[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'VisitorLog'
      ORDER BY ordinal_position
    `
    console.log('VisitorLog columns:', JSON.stringify(columns))

    // نحاول الإدخال
    try {
      await db.$executeRaw`
        INSERT INTO "VisitorLog" (id, page, system)
        VALUES (gen_random_uuid(), ${page || 'unknown'}, ${system || null})
      `
      return NextResponse.json({ success: true })
    } catch (insertError: any) {
      return NextResponse.json({
        success: false,
        error: insertError.message,
        columns: columns
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Visitor API error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
