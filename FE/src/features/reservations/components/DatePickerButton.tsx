'use client'

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { vi } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatDateKey, formatDateKeyLong, keyToLocalDate, localDateToKey } from '../lib/reservation-view'

type DatePickerButtonProps = {
  /** Khóa ngày "yyyy-MM-dd" */
  value: string
  onChange: (dateKey: string) => void
  /** Không cho chọn ngày trước khóa này */
  minDate?: string
  /** Hiện thứ trong tuần */
  long?: boolean
  id?: string
  className?: string
  disabled?: boolean
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/** Ô chọn ngày (Popover + Calendar), vùng chạm 44 px cho tablet. */
export function DatePickerButton({ value, onChange, minDate, long, className, ...props }: DatePickerButtonProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? keyToLocalDate(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('h-11 justify-start font-normal tabular-nums aria-invalid:border-destructive', className)}
          {...props}
        >
          <CalendarDays className="text-muted-foreground" aria-hidden="true" />
          {value ? (long ? formatDateKeyLong(value) : formatDateKey(value)) : <span className="text-muted-foreground">Chọn ngày</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={vi}
          selected={selected}
          defaultMonth={selected}
          disabled={minDate ? { before: keyToLocalDate(minDate) } : undefined}
          onSelect={(date) => {
            if (!date) return
            onChange(localDateToKey(date))
            setOpen(false)
          }}
          className="[--cell-size:--spacing(11)]"
        />
      </PopoverContent>
    </Popover>
  )
}
