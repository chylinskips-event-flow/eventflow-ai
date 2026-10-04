import { Toaster } from "@/components/ui/sonner";

export default function ModeratorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
