import { MoreHorizontalIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { InvoicesTableActionsProps } from './types'

export function InvoicesTableActions({ invoice, onView, onVoid, onPay }: InvoicesTableActionsProps) {
  if (!onView && !onVoid && !onPay) {
    return null
  }

  return (
    <div className="flex items-center justify-center">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Open menu">
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {onView && <DropdownMenuItem onClick={() => onView?.(invoice)}>View</DropdownMenuItem>}
          {onPay && <DropdownMenuItem onClick={() => onPay?.(invoice)}>Pay</DropdownMenuItem>}
          {onVoid && (
            <>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <DropdownMenuItem closeOnClick={false} variant="destructive">
                      Void
                    </DropdownMenuItem>
                  }
                />
                <AlertDialogContent className="sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Void Invoice</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to void the invoice <span className="font-bold">{invoice.number}</span>?
                      <br />
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onVoid?.(invoice)} variant="destructive">
                      Void
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
