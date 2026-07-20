import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WishlistGrid from "@/components/wishlist/WishlistGrid";

export default function WishlistPage() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16">
        <h1 className="text-3xl font-bold tracking-tightest text-ink lg:text-4xl">
          Your Wishlist
        </h1>
        <WishlistGrid />
      </section>

      <Footer />
    </main>
  );
}
