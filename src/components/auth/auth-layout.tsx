import Image from "next/image";

type AuthLayoutProps = {
  children: React.ReactNode;
  imageSide?: "left" | "right";
};

export function AuthLayout({ children, imageSide = "right" }: AuthLayoutProps) {
  const formOnLeft = imageSide === "right";

  return (
    <main className="relative isolate grid min-h-svh overflow-hidden bg-(--lifeops-page) text-(--lifeops-fg) lg:grid-cols-2">
      <div aria-hidden className="pointer-events-none absolute -top-28 right-[-120px] z-0 size-[420px] rounded-full bg-[#c9a86c]/15 blur-[100px] dark:bg-[#FBDBAC]/10 lg:hidden" />

      <section className={`relative z-10 flex min-h-svh items-center justify-center px-5 py-10 sm:px-10 lg:row-start-1 lg:px-12 xl:px-20 ${formOnLeft ? "lg:col-start-1" : "lg:col-start-2"}`}>
        {children}
      </section>

      <aside aria-hidden="true" className={`pointer-events-none absolute inset-0 z-0 overflow-hidden lg:relative lg:inset-auto lg:row-start-1 lg:min-h-svh ${formOnLeft ? "lg:col-start-2" : "lg:col-start-1"}`}>
        <Image
          src="/assets/images/consultants-1.jpeg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className={`object-cover opacity-35 lg:opacity-50 ${formOnLeft ? "object-[42%_center] lg:object-[30%_center]" : "object-[42%_center] lg:object-[70%_center]"}`}
        />
        <div className="absolute inset-0 bg-linear-to-b from-(--lifeops-page)/60 via-(--lifeops-page)/88 to-(--lifeops-page) lg:hidden" />
        <div className={`absolute inset-0 hidden lg:block ${formOnLeft ? "bg-linear-to-r from-(--lifeops-page) via-(--lifeops-page)/80 to-(--lifeops-page)/35" : "bg-linear-to-l from-(--lifeops-page) via-(--lifeops-page)/80 to-(--lifeops-page)/35"}`} />
      </aside>
    </main>
  );
}
