import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import CourseSetup from "./components/CourseSetup";
import RosterUpload from "./components/RosterUpload";
import CourseDetail from "./components/CourseDetail";
import AssignmentWizard from "./components/AssignmentWizard"; // Anticipating next step
import ImportSubmissions from "./components/ImportSubmissions";
import GraderWorkspace from "./components/GraderWorkspace";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/create-course" element={<CourseSetup />} />
        <Route path="/course/:courseId" element={<CourseDetail />} />
        <Route path="/create-assignment/:courseId" element={<AssignmentWizard />} />
        <Route path="/import-submissions/:courseId/:assignmentId" element={<ImportSubmissions />} />
        <Route path="/grader/:courseId/:assignmentId" element={<GraderWorkspace />} />
        <Route path="/import-roster/:courseId" element={<RosterUpload />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
