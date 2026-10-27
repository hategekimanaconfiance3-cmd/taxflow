import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, FileSearch, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <FileSearch className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Page Not Found</CardTitle>
          <CardDescription className="text-muted-foreground">
            The page you are looking for does&apos;t exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Link href="/" passHref>
              <Button variant="outline" className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Home
              </Button>
            </Link>
            <Link href="/dashboard" passHref>
              <Button className="w-full">
                Dashboard
                <ArrowLeft className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="text-center text-sm text-muted-foreground">
            <p>Error code: 404</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
