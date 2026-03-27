'use client'
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, Clock, Package, Heart, Ban, Syringe } from "lucide-react"

interface StatsCardsProps { stats: { totalItems: number; expiredItems: number; expiringItems: number; holdItems: number; lifeSavingItems: number; vaccineItems: number }; onCardClick: (cat: string) => void }

export function StatsCards({ stats, onCardClick }: StatsCardsProps) {
  const cards = [
    { id: 'total', label: 'إجمالي البنود', value: stats.totalItems, icon: Package, color: 'text-blue-500', bgColor: 'bg-blue-50', clickable: false },
    { id: 'expired', label: 'البنود المنتهية', value: stats.expiredItems, icon: AlertTriangle, color: 'text-red-500', bgColor: 'bg-red-50', clickable: true },
    { id: 'expiring', label: 'قاربت على الانتهاء', value: stats.expiringItems, icon: Clock, color: 'text-orange-500', bgColor: 'bg-orange-50', clickable: true },
    { id: 'hold', label: 'البنود عليها Hold', value: stats.holdItems, icon: Ban, color: 'text-yellow-600', bgColor: 'bg-yellow-50', clickable: true },
    { id: 'life-saving', label: 'البنود المنقذة للحياة', value: stats.lifeSavingItems, icon: Heart, color: 'text-pink-500', bgColor: 'bg-pink-50', clickable: true },
    { id: 'vaccine', label: 'اللقاحات', value: stats.vaccineItems || 0, icon: Syringe, color: 'text-green-500', bgColor: 'bg-green-50', clickable: true },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.id} className={${"$"}{card.clickable ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''} {card.bgColor}} onClick={() => card.clickable && onCardClick(card.id)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-gray-600">{card.label}</p><p className={	ext-2xl font-bold {card.color}}>{card.value.toLocaleString('ar-SA')}</p></div>
                <Icon className={w-8 h-8 {card.color}} />
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
