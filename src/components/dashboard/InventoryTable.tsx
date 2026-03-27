'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, ChevronLeft, ChevronRight, Heart, Ban, AlertTriangle, Syringe } from "lucide-react"

interface InventoryItem { id: string; genericItemNumber: string | null; genericItemDescription: string | null; customerItemNumber: string | null; totalQty: number; availableQty: number; holdQty: number; expiryDate: string | null; daysToExpire: number; isLifeSaving: boolean; isNarcotic: boolean; isVaccine: boolean }
interface InventoryTableProps { system: 'hoz' | 'mwsal'; category?: string }

export function InventoryTable({ system, category = 'all' }: InventoryTableProps) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [sortBy, setSortBy] = useState('daysToExpire')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  useEffect(() => { fetchItems() }, [system, category, page, sortBy, sortOrder])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ system, category, page: page.toString(), limit: '20', search, sortBy, sortOrder })
      const res = await fetch(/api/inventory?{params})
      const data = await res.json()
      setItems(data.items || []); setTotalPages(data.pagination?.totalPages || 1)
    } catch { } finally { setLoading(false) }
  }

  const handleSearch = () => { setPage(1); fetchItems() }
  const getExpiryBadge = (days: number) => {
    if (days <= 0) return <Badge variant="destructive">منتهي</Badge>
    if (days <= 30) return <Badge className="bg-red-500 text-white">خلال {days} يوم</Badge>
    if (days <= 90) return <Badge className="bg-orange-500 text-white">خلال {days} يوم</Badge>
    if (days <= 180) return <Badge className="bg-yellow-500 text-white">خلال {Math.floor(days/30)} شهر</Badge>
    return <Badge className="bg-green-500 text-white">سليم</Badge>
  }
  const getItemBadges = (item: InventoryItem) => {
    const badges = []
    if (item.isLifeSaving) badges.push(<span key="l" title="منقذ للحياة"><Heart className="w-4 h-4 text-pink-500" /></span>)
    if (item.isNarcotic) badges.push(<span key="n" title="مخدر"><Ban className="w-4 h-4 text-purple-500" /></span>)
    if (item.isVaccine) badges.push(<span key="v" title="لقاح"><Syringe className="w-4 h-4 text-green-500" /></span>)
    return badges
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-4">
          <span>قائمة المخزون</span>
          <div className="flex gap-2 flex-wrap">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40"><SelectValue placeholder="ترتيب حسب" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daysToExpire">تاريخ الانتهاء</SelectItem>
                <SelectItem value="totalQty">الكمية</SelectItem>
                <SelectItem value="genericItemNumber">رقم البند</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'asc' | 'desc')}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">تصاعدي</SelectItem>
                <SelectItem value="desc">تنازلي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Input placeholder="بحث برقم البند أو الوصف..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="max-w-sm" />
          <Button onClick={handleSearch}><Search className="w-4 h-4 ml-2" />بحث</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم البند</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>رقم الوزاري</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>المتاحة</TableHead>
                <TableHead>Hold</TableHead>
                <TableHead>تاريخ الانتهاء</TableHead>
                <TableHead>الأيام المتبقية</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-500">لا توجد بيانات</TableCell></TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className={item.daysToExpire <= 0 ? "bg-red-50" : item.daysToExpire <= 90 ? "bg-orange-50" : ""}>
                    <TableCell className="font-mono text-sm"><div className="flex items-center gap-1">{getItemBadges(item)}{item.genericItemNumber}</div></TableCell>
                    <TableCell className="max-w-xs truncate">{item.genericItemDescription}</TableCell>
                    <TableCell>{item.customerItemNumber}</TableCell>
                    <TableCell>{item.totalQty.toLocaleString('ar-SA')}</TableCell>
                    <TableCell>{item.availableQty.toLocaleString('ar-SA')}</TableCell>
                    <TableCell>{item.holdQty > 0 && <div className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-yellow-500" />{item.holdQty.toLocaleString('ar-SA')}</div>}</TableCell>
                    <TableCell>{item.expiryDate}</TableCell>
                    <TableCell>{Math.round(item.daysToExpire)}</TableCell>
                    <TableCell>{getExpiryBadge(item.daysToExpire)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-4 flex-wrap gap-4">
          <p className="text-sm text-gray-500">صفحة {page} من {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" />السابق</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>التالي<ChevronLeft className="w-4 h-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
