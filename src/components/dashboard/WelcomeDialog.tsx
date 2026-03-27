'use client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Building2, Truck } from "lucide-react"

interface WelcomeDialogProps { open: boolean; onSelect: (system: 'hoz' | 'mwsal') => void }

export function WelcomeDialog({ open, onSelect }: WelcomeDialogProps) {
  if (!open) return null
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center space-y-4">
          <CardTitle className="text-3xl font-bold text-gray-800">مرحباً بكم في نظام دراسة المخزون</CardTitle>
          <CardDescription className="text-lg">عايد حمود العنزي - مدير التخطيط</CardDescription>
          <p className="text-sm text-muted-foreground">إعداد: عبدالله فرحان العنزي - موظف نوبكو</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-center text-gray-600">يرجى اختيار النظام للمتابعة</p>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 hover:border-blue-500" onClick={() => onSelect('hoz')}>
              <CardContent className="p-6 text-center">
                <Building2 className="w-16 h-16 mx-auto mb-4 text-blue-500" />
                <h3 className="text-xl font-bold mb-2">هوز (E200)</h3>
                <p className="text-gray-500">مستودع هوز</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 hover:border-green-500" onClick={() => onSelect('mwsal')}>
              <CardContent className="p-6 text-center">
                <Truck className="w-16 h-16 mx-auto mb-4 text-green-500" />
                <h3 className="text-xl font-bold mb-2">موصول (E300)</h3>
                <p className="text-gray-500">مستودع موصول</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
