import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { page, system } = body
    console.log('Visitor API called:', { page, system })

    // نستخدم raw query مع الأعمدة الموجودة فقط (id, page, system)
    await db.$executeRaw`
      INSERT INTO "VisitorLog" (id, page, system)
      VALUES (gen_random_uuid(), ${page || 'unknown'}, ${system || null})
    `

    console.log('Visitor logged successfully')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Visitor API error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
