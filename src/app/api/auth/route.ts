import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()
    
    if (username === 'admin' && password === 'admin123') {
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      
      await db.adminSession.create({
        data: { token, expiresAt }
      })
      
      const cookieStore = await cookies()
      cookieStore.set('admin_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt
      })
      
      return NextResponse.json({ success: true })
    }
    
    return NextResponse.json({ error: 'بيانات الدخول غير صحيحة' }, { status: 401 })
  } catch (error) {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('admin_session')
    
    if (session?.value) {
      await db.adminSession.deleteMany({
        where: { token: session.value }
      })
    }
    
    cookieStore.delete('admin_session')
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
