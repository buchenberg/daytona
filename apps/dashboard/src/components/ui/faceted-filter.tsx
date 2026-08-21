import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { PlusCircle, X } from 'lucide-react'
import { AnimatePresence, motion, type MotionProps } from 'motion/react'
import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'
import { buttonVariants } from './button'
import {
  Command,
  CommandCheckboxItem,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

const defaultIcon = <PlusCircle />
const segmentEase = 'easeOut' as const
const segmentTransitionType = 'tween' as const
const segmentTransition = {
  layout: { type: segmentTransitionType, duration: 0.16, ease: segmentEase },
  opacity: { type: segmentTransitionType, duration: 0.12, ease: segmentEase },
  x: { type: segmentTransitionType, duration: 0.12, ease: segmentEase },
  filter: { type: segmentTransitionType, duration: 0.12, ease: segmentEase },
}
const segmentMotion = {
  initial: false as const,
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -4, filter: 'blur(2px)' },
}
const clearSegmentMotion = {
  initial: false as const,
  animate: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
    transition: {
      opacity: { type: segmentTransitionType, duration: 0.18, delay: 0.08, ease: segmentEase },
      x: { type: segmentTransitionType, duration: 0.18, delay: 0.08, ease: segmentEase },
      filter: { type: segmentTransitionType, duration: 0.18, delay: 0.08, ease: segmentEase },
    },
  },
  exit: {
    opacity: 0,
    x: -4,
    filter: 'blur(2px)',
    transition: {
      opacity: { type: segmentTransitionType, duration: 0.07, ease: segmentEase },
      x: { type: segmentTransitionType, duration: 0.07, ease: segmentEase },
      filter: { type: segmentTransitionType, duration: 0.07, ease: segmentEase },
    },
  },
}

type SegmentTransition = typeof segmentTransition
type ClearSegmentTransition = SegmentTransition | { layout: typeof segmentTransition.layout }

export type FacetedFilterOption = {
  label: ReactNode
  value: string
  icon?: ReactNode
  description?: ReactNode
}

export type FacetedFilterOperator = {
  label: ReactNode
  value: string
  /** Compact glyph shown on the chip; falls back to `label` when absent. */
  symbol?: ReactNode
}

export type FacetedFilterValue = {
  label: ReactNode
  value: string
}

const defaultOperators: readonly FacetedFilterOperator[] = [{ label: 'is', value: 'is' }]

type FacetedFilterContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  hasValue: boolean
  title: string
  onClear?: () => void
  layout: boolean
  contentLayout: boolean | 'position'
  segmentAnimation: typeof segmentMotion | { initial: false }
  clearSegmentAnimation: typeof clearSegmentMotion | { initial: false }
  valueSegmentTransition: SegmentTransition
  clearSegmentTransition: ClearSegmentTransition
}

const FacetedFilterContext = createContext<FacetedFilterContextValue | null>(null)

type FacetedFilterButtonProps = Omit<ComponentPropsWithoutRef<'button'>, keyof MotionProps> & {
  children?: ReactNode
}

type FacetedFilterSpanProps = Omit<ComponentPropsWithoutRef<'span'>, keyof MotionProps> & {
  children?: ReactNode
}

function useFacetedFilterContext(component: string) {
  const context = use(FacetedFilterContext)

  if (!context) {
    throw new Error(`${component} must be used inside FacetedFilterRoot`)
  }

  return context
}

function shouldRenderIcon(icon: ReactNode) {
  return icon !== null && icon !== undefined && typeof icon !== 'boolean'
}

function pluralizeFilterTitle(title: string | undefined, count: number) {
  const label = title?.trim().toLowerCase() || 'value'

  if (count === 1) {
    return label
  }

  if (label.endsWith('status')) {
    return `${label}es`
  }

  if (label.endsWith('class')) {
    return `${label}es`
  }

  if (label.endsWith('y')) {
    return `${label.slice(0, -1)}ies`
  }

  if (label.endsWith('s')) {
    return label
  }

  return `${label}s`
}

function getSelectedValueItems(options: readonly FacetedFilterOption[], values: ReadonlySet<string>) {
  return Array.from(values).map((value) => ({
    value,
    label: options.find((option) => option.value === value)?.label ?? value,
  }))
}

function FacetedFilterIcon({ children, className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      data-slot="faceted-filter-icon"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

interface FacetedFilterRootProps extends Omit<ComponentProps<typeof Popover>, 'open' | 'defaultOpen' | 'onOpenChange'> {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  hasValue?: boolean
  title?: string
  onClear?: () => void
}

function FacetedFilterRoot({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  hasValue = false,
  title = 'Filter',
  onClear,
  children,
  ...props
}: FacetedFilterRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = openProp ?? uncontrolledOpen

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setUncontrolledOpen(nextOpen)
      }

      onOpenChange?.(nextOpen)
    },
    [onOpenChange, openProp],
  )

  const contextValue = useMemo<FacetedFilterContextValue>(
    () => ({
      open,
      setOpen,
      hasValue,
      title,
      onClear,
      layout: true,
      contentLayout: 'position',
      segmentAnimation: segmentMotion,
      clearSegmentAnimation: clearSegmentMotion,
      valueSegmentTransition: segmentTransition,
      clearSegmentTransition: { layout: { type: segmentTransitionType, duration: 0.1, ease: segmentEase } },
    }),
    [hasValue, onClear, open, setOpen, title],
  )

  return (
    <FacetedFilterContext.Provider value={contextValue}>
      <Popover open={open} onOpenChange={setOpen} {...props}>
        {children}
      </Popover>
    </FacetedFilterContext.Provider>
  )
}

function FacetedFilterAnchor({ className, render, ...props }: useRender.ComponentProps<'div'>) {
  const defaultProps = {
    'data-slot': 'faceted-filter-anchor',
    className: cn('inline-flex h-8 min-w-0 items-stretch rounded-md bg-background dark:bg-card text-sm', className),
  }

  return useRender({
    render,
    defaultTagName: 'div',
    props: mergeProps<'div'>(defaultProps, props),
  })
}

interface FacetedFilterLabelTriggerProps extends FacetedFilterButtonProps {
  render?: useRender.RenderProp
  icon?: ReactNode
}

function FacetedFilterLabelTrigger({
  render,
  icon = defaultIcon,
  className,
  children,
  ...props
}: FacetedFilterLabelTriggerProps) {
  const context = useFacetedFilterContext('FacetedFilterLabelTrigger')
  const hasIcon = shouldRenderIcon(icon)

  const defaultProps = {
    type: 'button',
    disabled: true,
    'data-slot': 'faceted-filter-label-trigger',
    className: cn(
      'inline-flex min-w-0 cursor-default items-center gap-1.5 border border-border bg-background dark:bg-card font-medium text-foreground transition-colors outline-hidden disabled:pointer-events-none disabled:opacity-100',
      !context.hasValue && buttonVariants({ variant: 'outline', size: 'sm' }),
      'h-full',
      !context.hasValue && 'disabled:opacity-100',
      {
        'rounded-l-md px-3': context.hasValue,
        'rounded-md! border-dashed': !context.hasValue,
      },
      className,
    ),
    children: render ? (
      children
    ) : (
      <>
        {hasIcon && <FacetedFilterIcon>{icon}</FacetedFilterIcon>}
        <span data-slot="faceted-filter-label" className="min-w-0 truncate whitespace-nowrap">
          {children}
        </span>
      </>
    ),
  }

  return useRender({
    render: render ?? <motion.button layout={context.layout} transition={segmentTransition} />,
    props: mergeProps(props, defaultProps),
  })
}

interface FacetedFilterValueTriggerProps extends FacetedFilterButtonProps {
  render?: ComponentProps<typeof PopoverTrigger>['render']
}

function FacetedFilterValueTrigger({
  render,
  className,
  children,
  tabIndex,
  ...props
}: FacetedFilterValueTriggerProps) {
  const context = useFacetedFilterContext('FacetedFilterValueTrigger')
  const animationProps = {
    layout: context.layout,
    transition: context.hasValue ? context.valueSegmentTransition : segmentTransition,
    ...(context.hasValue ? context.segmentAnimation : { initial: false }),
  }

  return (
    <PopoverTrigger
      {...props}
      render={render ?? <motion.button {...animationProps} />}
      type="button"
      tabIndex={context.hasValue ? tabIndex : -1}
      aria-hidden={!context.hasValue}
      data-slot="faceted-filter-value-trigger"
      className={cn(
        'inline-flex h-full min-w-0 items-stretch overflow-hidden font-medium text-foreground transition-colors outline-hidden hover:text-accent-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'hover:bg-accent dark:hover:bg-accent',
        {
          '-ml-px max-w-72 cursor-pointer border border-border bg-background dark:bg-card': context.hasValue,
          'w-0 max-w-0 border-0 p-0 opacity-0 pointer-events-none': !context.hasValue,
          'rounded-none!': context.hasValue && context.onClear,
          'rounded-r-md': context.hasValue && !context.onClear,
        },
        className,
      )}
    >
      {render ? (
        children
      ) : (
        <AnimatePresence initial={false} mode="popLayout">
          {context.hasValue ? children : null}
        </AnimatePresence>
      )}
    </PopoverTrigger>
  )
}

interface FacetedFilterSegmentProps extends FacetedFilterSpanProps {
  render?: useRender.RenderProp
}

function FacetedFilterSegment({ render, className, ...props }: FacetedFilterSegmentProps) {
  const context = useFacetedFilterContext('FacetedFilterSegment')

  const defaultProps = {
    'data-slot': 'faceted-filter-segment',
    className,
  }

  return useRender({
    render: render ?? (
      <motion.span layout={context.contentLayout} transition={segmentTransition} {...context.segmentAnimation} />
    ),
    props: mergeProps(props, defaultProps),
  })
}

interface FacetedFilterOperatorProps extends FacetedFilterSpanProps {
  operator?: string
  operators?: readonly FacetedFilterOperator[]
  onOperatorChange?: (operator: string) => void
}

function FacetedFilterOperator({
  operator,
  operators = defaultOperators,
  onOperatorChange,
  className,
  ...props
}: FacetedFilterOperatorProps) {
  const context = useFacetedFilterContext('FacetedFilterOperator')
  const selectedOperator = operators.find((option) => option.value === operator) ?? operators[0] ?? defaultOperators[0]
  const canChangeOperator = operators.length > 1 && !!onOperatorChange

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {context.hasValue &&
        (canChangeOperator ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <motion.button
                  key="operator"
                  layout={context.contentLayout}
                  transition={segmentTransition}
                  {...context.segmentAnimation}
                />
              }
              type="button"
              className={cn(
                '-ml-px inline-flex cursor-pointer items-center whitespace-nowrap border border-border bg-background dark:bg-card px-3 text-muted-foreground transition-colors outline-hidden hover:text-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                'hover:bg-accent dark:hover:bg-accent',
                className,
              )}
              aria-label="Change filter operator"
            >
              {selectedOperator.symbol ?? selectedOperator.label}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-32">
              <DropdownMenuRadioGroup value={selectedOperator.value} onValueChange={onOperatorChange}>
                {operators.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.symbol !== undefined && (
                      <span className="mr-2 inline-block w-4 text-center text-muted-foreground">{option.symbol}</span>
                    )}
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <FacetedFilterSegment
            key="operator"
            className={cn(
              '-ml-px inline-flex cursor-default items-center whitespace-nowrap border border-border bg-background dark:bg-card px-3 text-muted-foreground',
              className,
            )}
            {...props}
          >
            {selectedOperator.symbol ?? selectedOperator.label}
          </FacetedFilterSegment>
        ))}
    </AnimatePresence>
  )
}

function FacetedFilterValueSummary({ className, ...props }: FacetedFilterSpanProps) {
  return <FacetedFilterSegment className={cn('inline-flex min-w-0 items-center truncate', className)} {...props} />
}

function FacetedFilterValueList({ className, children, ...props }: FacetedFilterSpanProps) {
  const context = useFacetedFilterContext('FacetedFilterValueList')

  return (
    <motion.span
      data-slot="faceted-filter-value-list"
      layout={context.contentLayout}
      transition={segmentTransition}
      className={cn('flex min-w-0 max-w-full items-stretch overflow-hidden', className)}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {children}
      </AnimatePresence>
    </motion.span>
  )
}

interface FacetedFilterValueItemProps extends FacetedFilterSpanProps {
  render?: useRender.RenderProp
}

function FacetedFilterValueItem({ render, className, children, ...props }: FacetedFilterValueItemProps) {
  const context = useFacetedFilterContext('FacetedFilterValueItem')

  const defaultProps = {
    'data-slot': 'faceted-filter-value-item',
    className: cn('inline-flex min-w-0 max-w-40 shrink items-center text-foreground', className),
    children,
  }

  return useRender({
    render: render ?? (
      <motion.span
        layout={context.contentLayout}
        transition={segmentTransition}
        initial={false}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, x: 4, filter: 'blur(2px)' }}
      />
    ),
    props: mergeProps(props, defaultProps),
  })
}

interface FacetedFilterValuesProps extends FacetedFilterSpanProps {
  items: readonly FacetedFilterValue[]
  title?: string
  maxValues?: number
}

function FacetedFilterValues({ items, title, maxValues = 2, className, ...props }: FacetedFilterValuesProps) {
  const shouldShowSummary = items.length > maxValues

  if (items.length === 0) {
    return null
  }

  if (shouldShowSummary) {
    return (
      <FacetedFilterValueSummary key="summary" className={className} {...props}>
        {items.length} {pluralizeFilterTitle(title, items.length)}
      </FacetedFilterValueSummary>
    )
  }

  return (
    <FacetedFilterValueList key="values" className={className} {...props}>
      {items.map((item, index) => (
        <FacetedFilterValueItem
          key={item.value}
          className={cn({
            'border-l border-border': index > 0,
          })}
        >
          <span className="block min-w-0 w-full truncate px-2">{item.label}</span>
        </FacetedFilterValueItem>
      ))}
    </FacetedFilterValueList>
  )
}

interface FacetedFilterClearProps extends FacetedFilterButtonProps {
  render?: useRender.RenderProp
}

function FacetedFilterClear({ render, className, children, onClick, ...props }: FacetedFilterClearProps) {
  const context = useFacetedFilterContext('FacetedFilterClear')
  const handleClick: FacetedFilterButtonProps['onClick'] = (event) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    context.onClear?.()
  }

  const defaultProps = {
    type: 'button',
    'data-slot': 'faceted-filter-clear',
    className: cn(
      '-ml-px inline-flex w-8 cursor-pointer items-center justify-center rounded-r-md border border-border bg-background dark:bg-card text-muted-foreground transition-colors outline-hidden hover:text-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
      'hover:bg-accent dark:hover:bg-accent',
      className,
    ),
    onClick: handleClick,
    children: render ? children : (children ?? <X className="size-3.5" />),
  }

  const element = useRender({
    render: render ?? (
      <motion.button
        key="clear"
        layout={context.contentLayout}
        transition={context.clearSegmentTransition}
        {...context.clearSegmentAnimation}
      />
    ),
    enabled: Boolean(context.hasValue && context.onClear),
    props: mergeProps(props, defaultProps),
  })

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {element}
    </AnimatePresence>
  )
}

function FacetedFilterContent({ className, align = 'start', ...props }: ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      data-slot="faceted-filter-content"
      className={cn('w-[200px] p-0', className)}
      align={align}
      {...props}
    />
  )
}

export interface FacetedFilterProps {
  title: string
  options: readonly FacetedFilterOption[]
  values: ReadonlySet<string>
  onValuesChange: (values: Set<string>) => void
  operator?: string
  operators?: readonly FacetedFilterOperator[]
  onOperatorChange?: (operator: string) => void
  facets?: ReadonlyMap<string, number>
  maxValues?: number
  className?: string
  contentClassName?: string
  icon?: ReactNode
}

function FacetedFilter({
  title,
  options,
  values,
  onValuesChange,
  operator,
  operators = defaultOperators,
  onOperatorChange,
  facets,
  maxValues = 2,
  className,
  contentClassName,
  icon = defaultIcon,
}: FacetedFilterProps) {
  const selectedCount = values.size
  const selectedValueItems = getSelectedValueItems(options, values)
  const hasSelectedValues = selectedCount > 0

  if (!hasSelectedValues) {
    return null
  }

  const handleClear = () => {
    onValuesChange(new Set())
  }

  return (
    <FacetedFilterRoot title={title} hasValue={hasSelectedValues} onClear={handleClear}>
      <FacetedFilterAnchor className={className}>
        <FacetedFilterLabelTrigger icon={icon} aria-label={`Filter by ${title}`}>
          {title}
        </FacetedFilterLabelTrigger>
        <FacetedFilterOperator operator={operator} operators={operators} onOperatorChange={onOperatorChange} />
        <FacetedFilterValueTrigger
          className={cn({
            'px-1': hasSelectedValues && selectedCount <= maxValues,
            'px-2': hasSelectedValues && selectedCount > maxValues,
          })}
          aria-label={`Edit ${title} filter`}
        >
          <FacetedFilterValues title={title} items={selectedValueItems} maxValues={maxValues} />
        </FacetedFilterValueTrigger>
        <FacetedFilterClear aria-label={`Clear ${title} filter`} />
      </FacetedFilterAnchor>
      <FacetedFilterContent className={contentClassName}>
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = values.has(option.value)
                const facetCount = facets?.get(option.value)

                return (
                  <CommandCheckboxItem
                    checked={isSelected}
                    key={option.value}
                    onSelect={() => {
                      const newValue = new Set(values)

                      if (isSelected) {
                        newValue.delete(option.value)
                      } else {
                        newValue.add(option.value)
                      }

                      onValuesChange(newValue)
                    }}
                  >
                    {shouldRenderIcon(option.icon) && (
                      <span className="mr-2">
                        <FacetedFilterIcon>{option.icon}</FacetedFilterIcon>
                      </span>
                    )}
                    {option.label}
                    {facetCount !== undefined && (
                      <span className="ml-auto flex h-4 shrink-0 items-center justify-end pl-2 font-mono text-xs">
                        {facetCount}
                      </span>
                    )}
                  </CommandCheckboxItem>
                )
              })}
            </CommandGroup>
            {hasSelectedValues && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={handleClear} className="justify-center text-center">
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </FacetedFilterContent>
    </FacetedFilterRoot>
  )
}

export {
  FacetedFilter,
  FacetedFilterAnchor,
  FacetedFilterClear,
  FacetedFilterContent,
  FacetedFilterIcon,
  FacetedFilterLabelTrigger,
  FacetedFilterOperator,
  FacetedFilterRoot,
  FacetedFilterSegment,
  FacetedFilterValueItem,
  FacetedFilterValueList,
  FacetedFilterValueSummary,
  FacetedFilterValueTrigger,
  FacetedFilterValues,
}
