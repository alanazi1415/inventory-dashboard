'use client'
import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload, FileSpreadsheet, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface AdminPageProps { onLogout: () => void }

export function AdminPage({ onLogout }: AdminPageProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedSystem, setSelectedSystem] = useState<'hoz' | 'mwsal' | 'life_saving' | 'narcotic' | 'vaccine'>('hoz')
  const [uploadLogs, setUploadLogs] = useState<any[]>([])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file); formData.append('system', selectedSystem)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        toast({ title: "تم الرفع بنجاح", description: data.message })
        setUploadLogs(prev => [{ fileName: file.name, system: selectedSystem, records: data.recordsCount, time: new Date().toLocaleString('ar-SA') }, ...prev])
      } else toast({ title: "خطأ", description: data.error, variant: "destructive" })
    } catch { toast({ title: "خطأ", description: 'حدث خطأ في الاتصال', variant: "destructive" }) }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const systemOptions = [
    { value: 'hoz', label: 'هوز (E200)', desc: 'مستودع هوز' },
    { value: 'mwsal', label: 'موصول (E300)', desc: 'مستودع موصول' },
    { value: 'life_saving', label: 'البنود المنقذة للحياة', desc: 'قائمة البنود المنقذة' },
    { value: 'narcotic', label: 'المخدرات', desc: 'قائمة البنود المخدرة' },
    { value: 'vaccine', label: 'اللقاحات', desc: 'قائمة اللقاحات' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">لوحة تحكم الأدمن</h1><p className="text-gray-500">إدارة البيانات والملفات</p></div>
        <Button variant="outline" onClick={onLogout}>تسجيل الخروج</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5" />رفع ملفات Excel</CardTitle>
          <CardDescription>اختر النظام ثم ارفع ملف Excel الخاص به</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {systemOptions.map((opt) => (
              <button key={opt.value} onClick={() => setSelectedSystem(opt.value as any)} className={p-3 rounded-lg border-2 text-center transition-colors {selectedSystem === opt.value ? 'border-primary bg-primary/10' : 'border-gray-200 hover:border-gray-300'}}>
                <p className="font-medium text-sm">{opt.label}</p><p className="text-xs text-gray-500">{opt.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="min-w-32">
              {uploading ? <><RefreshCw className="w-4 h-4 ml-2 animate-spin" />جاري الرفع...</> : <><FileSpreadsheet className="w-4 h-4 ml-2" />اختار ملف</>}
            </Button>
            <p className="text-sm text-gray-500">ملفات مدعومة: .xlsx, .xls</p>
          </div>
        </CardContent>
      </Card>
      {uploadLogs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>سجل العمليات</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadLogs.map((log, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3"><FileSpreadsheet className="w-5 h-5 text-green-500" /><div><p className="font-medium">{log.fileName}</p><p className="text-sm text-gray-500">{log.system} - {log.records} سجل</p></div></div>
                  <Badge variant="secondary">{log.time}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>تعليمات</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p><strong>1.</strong> اختر النظام ثم ارفع ملف Excel</p>
          <p><strong>2.</strong> يجب أن يحتوي الملف على: Generic Item Number, Expiry Date, Total Qty</p>
          <p><strong>3.</strong> يتم حساب الأيام المتبقية تلقائياً من تاريخ الانتهاء</p>
          <p><strong>4.</strong> بيانات الدخول: admin / admin123</p>
        </CardContent>
      </Card>
    </div>
  )
}
