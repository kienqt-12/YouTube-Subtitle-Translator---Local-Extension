import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from './utils';

interface SwitchProps extends SwitchPrimitive.SwitchProps {
  className?: string;
}

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-slate-300 transition data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}
