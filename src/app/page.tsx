import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-24 bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">Student Satisfaction Dashboard</h1>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/dashboard" className="bg-purple-600 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg text-lg">
            View Dashboard
          </Link>
          <Link href="/review" className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-3 px-6 rounded-lg">
            Review & Edit Data
          </Link>
          <Link href="/data-processing" className="bg-green-600 hover:bg-green-800 text-white font-bold py-3 px-6 rounded-lg">
            Process Survey Data
          </Link>
          <Link href="/admin/structure" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
            Manage Structure
          </Link>
        </div>
      </div>
    </main>
  );
}