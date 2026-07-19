import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Gallery from "./pages/Gallery";
import Store from "./pages/Store";
import Goal from "./pages/Goal";

function App() {
  return (
    <Router>
     
      
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/Home" element={<Home />} />
        <Route path="/Gallery" element={<Gallery />} />
        <Route path="/Goal" element={<Goal />} />
        <Route path="/Store" element={<Store />} />
      </Routes>
    </Router>
  );
}

export default App;
