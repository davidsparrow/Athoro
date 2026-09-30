export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">{children}</div>;
}
