import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Loading from "./components/Loading.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Home from "./pages/Home.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NotFound from "./pages/NotFound.jsx";
import Tasks from "./pages/Tasks.jsx";
const PdfTools = lazy(
  () =>
    // Loads this page only when opened.
    import("./pages/PdfTools.jsx"),
);
const DocumentConverter = lazy(
  () =>
    // Loads this page only when opened.
    import("./pages/DocumentConverter.jsx"),
);
const ImageCompressor = lazy(
  () =>
    // Loads this page only when opened.
    import("./pages/ImageCompressor.jsx"),
);
const Notes = lazy(
  () =>
    // Loads this page only when opened.
    import("./pages/Notes.jsx"),
);
const Expenses = lazy(
  () =>
    // Loads this page only when opened.
    import("./pages/Expenses.jsx"),
);
function page(component) {
  // Shows a loader while a page opens.
  return (
    <Suspense fallback={<Loading message="Loading your tool…" />}>
      {component}
    </Suspense>
  );
}
export default function App() {
  // Connects pages to their routes.
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AuthPage key="login" />} />
        <Route
          path="/register"
          element={<AuthPage key="register" mode="register" />}
        />
        <Route path="/tools/pdf" element={page(<PdfTools />)} />
        <Route path="/tools/convert" element={page(<DocumentConverter />)} />
        <Route path="/tools/images" element={page(<ImageCompressor />)} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/expenses" element={page(<Expenses />)} />
          <Route path="/notes" element={page(<Notes />)} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
