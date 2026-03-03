import type { Metadata } from "next";
import Link from 'next/link';
import { assets } from './theme/assets';

export const metadata: Metadata = {
  title: "LifeOps - Streamline Your Life Operations",
  description: "Powerful tools to streamline your daily operations and boost productivity",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-6">
            {assets.brand.name}
          </h1>
          <p className="text-2xl text-gray-600 dark:text-gray-400 mb-4">
            {assets.brand.tagline}
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-500 mb-12 max-w-2xl mx-auto">
            Herramientas poderosas para optimizar tus operaciones diarias y aumentar la productividad
          </p>

          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg"
            >
              Comenzar
            </Link>
            <Link
              href="/login"
              className="px-8 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-semibold text-lg"
            >
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
