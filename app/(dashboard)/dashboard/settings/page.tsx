import { requireTraderSession } from "@/lib/auth-guard";
import { getProfile } from "@/lib/actions/settings.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Building, Phone, Mail, Shield } from "lucide-react";
import { ProfileForm } from "@/components/dashboard/settings/profile-form";

export default async function SettingsPage() {
    const session = await requireTraderSession();
    const profile = await getProfile();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Manage your profile and account preferences.
                </p>
            </div>

            {/* Profile Card — read-only info */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Account Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                                TIN:
                            </span>
                            <span className="font-mono font-semibold">
                                {profile.tinNumber || "—"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                                Phone:
                            </span>
                            <span>{profile.phoneNumber || "—"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                                Email:
                            </span>
                            <span>{profile.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                                Clearance:
                            </span>
                            <Badge variant="outline" className="text-xs capitalize">
                                {profile.clearanceStatus}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Building className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                                Role:
                            </span>
                            <Badge variant="outline" className="text-xs capitalize">
                                {profile.role}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">
                                Member since:
                            </span>
                            <span>
                                {new Date(
                                    profile.createdAt,
                                ).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Editable profile fields */}
            <ProfileForm
                name={profile.name}
                businessName={profile.businessName || ""}
            />
        </div>
    );
}
