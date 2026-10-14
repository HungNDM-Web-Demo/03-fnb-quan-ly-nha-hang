'use client'

import { FolderTree, MessageSquareText, UtensilsCrossed } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { permissions } from '@/config/permissions'
import { CategoryTab } from '../components/CategoryTab'
import { MenuItemsTab } from '../components/MenuItemsTab'
import { QuickNoteTab } from '../components/QuickNoteTab'

/**
 * SCR-11 Thực đơn (UC-03, UC-04; FR-06..FR-09; BR-28): tab Món, Danh mục, Ghi chú nhanh.
 * Vào trang cần `menu-items.update` (07 §4: bếp, phục vụ không thấy dù có `menu-items.view`).
 */
export function MenuItemsPage() {
  return (
    <PermissionGuard permission={permissions.menuItems.update} redirect>
      <div className="space-y-6">
        <PageHeader
          title="Thực đơn"
          icon={UtensilsCrossed}
          description="Món, giá, khu chế biến và thời gian chuẩn; báo tạm hết, ẩn món khỏi tablet phục vụ."
        />
        <Tabs defaultValue="items" className="gap-4">
          <TabsList className="max-w-full overflow-x-auto group-data-horizontal/tabs:h-[3.25rem]">
            <TabsTrigger value="items" className="px-4">
              <UtensilsCrossed aria-hidden="true" />
              Món
            </TabsTrigger>
            <TabsTrigger value="categories" className="px-4">
              <FolderTree aria-hidden="true" />
              Danh mục
            </TabsTrigger>
            <TabsTrigger value="quick-notes" className="px-4">
              <MessageSquareText aria-hidden="true" />
              Ghi chú nhanh
            </TabsTrigger>
          </TabsList>
          <TabsContent value="items">
            <MenuItemsTab />
          </TabsContent>
          <TabsContent value="categories">
            <CategoryTab />
          </TabsContent>
          <TabsContent value="quick-notes">
            <QuickNoteTab />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGuard>
  )
}
