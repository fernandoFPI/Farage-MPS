import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-4xl font-bold text-gray-800">404</h1>
      <p className="text-gray-500">Page not found</p>
      <Link to="/" className="text-brand-500 hover:underline">Go home</Link>
    </div>
  )
}
