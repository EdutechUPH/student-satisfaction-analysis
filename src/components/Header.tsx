// src/components/Header.tsx

import Link from 'next/link';

export const Header = () => {
  return (
    <header className="bg-gray-800 text-white shadow-md">
      <nav className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold hover:text-purple-300">
          Student Satisfaction Dashboard
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/dashboard" className="hover:text-purple-300 transition-colors">
            Dashboard
          </Link>
          <Link href="/review" className="hover:text-purple-300 transition-colors">
            Review Data
          </Link>
          <Link href="/data-processing" className="hover:text-purple-300 transition-colors">
            Process Data
          </Link>
          <Link href="/admin/structure" className="hover:text-purple-300 transition-colors">
            Manage Structure
          </Link>
        </div>
      </nav>
    </header>
  );
};