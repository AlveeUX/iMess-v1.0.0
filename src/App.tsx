import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import Meals from "./pages/Meals";
import Deposits from "./pages/Deposits";
import Expenses from "./pages/Expenses";
import Report from "./pages/Report";
import Settings from "./pages/Settings";
import Bazar from "./pages/Bazar";
import Transparency from "./pages/Transparency";
import Corrections from "./pages/Corrections";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/members" element={<Members />} />
              <Route path="/meals" element={<Meals />} />
              <Route path="/deposits" element={<Deposits />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/bazar" element={<Bazar />} />
              <Route path="/report" element={<Report />} />
              <Route path="/transparency" element={<Transparency />} />
              <Route path="/corrections" element={<Corrections />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
