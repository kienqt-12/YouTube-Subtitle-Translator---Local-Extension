import * as SliderPrimitive from '@radix-ui/react-slider';

interface SliderProps extends SliderPrimitive.SliderProps {}

export function Slider(props: SliderProps) {
  return (
    <SliderPrimitive.Root
      className="relative flex h-5 w-full touch-none select-none items-center"
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-slate-200">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-primary bg-white shadow focus:outline-none focus:ring-4 focus:ring-indigo-100" />
    </SliderPrimitive.Root>
  );
}
