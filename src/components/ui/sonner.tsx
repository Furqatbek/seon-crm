"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Dark pill at the bottom centre, white text, 4 seconds. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      duration={4000}
      visibleToasts={1}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center justify-center gap-2 rounded-full bg-text px-5 py-2.5 text-body text-bg shadow-float",
          title: "font-medium",
          description: "text-footnote",
          icon: "flex items-center",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
