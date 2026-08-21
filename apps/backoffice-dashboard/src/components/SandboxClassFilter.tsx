import { Checkbox } from '@dashboard/ui/checkbox'
import { Label } from '@dashboard/ui/label'
import { SANDBOX_CLASS_OPTIONS } from '@dashboard/components/SandboxTable/constants'

interface SandboxClassFilterProps {
  value?: string[]
  onChange: (value: string[] | undefined) => void
}

export const SandboxClassFilter = ({ value = [], onChange }: SandboxClassFilterProps) => {
  const toggle = (cls: string, checked: boolean) => {
    const next = checked ? [...value, cls] : value.filter((c) => c !== cls)
    onChange(next.length > 0 ? next : undefined)
  }

  return (
    <div className="space-y-2">
      <Label>Class</Label>
      <div className="space-y-2">
        {SANDBOX_CLASS_OPTIONS.map(({ value: cls, label }) => (
          <div key={cls} className="flex items-center space-x-2">
            <Checkbox
              id={`class-${cls}`}
              checked={value.includes(cls)}
              onCheckedChange={(checked) => toggle(cls, checked as boolean)}
            />
            <Label htmlFor={`class-${cls}`} className="text-sm font-normal">
              {label}
            </Label>
          </div>
        ))}
      </div>
    </div>
  )
}
