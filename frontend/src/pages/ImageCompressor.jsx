import { Link } from "react-router-dom";
import { ArrowLeft, Image } from "lucide-react";
import ImageTools from "../components/tools/ImageTools.jsx";
import usePageTitle from "../hooks/usePageTitle.js";
export default function ImageCompressor() {
  // Displays the image compression page.
  usePageTitle("Image compressor");
  return (
    <section className="image-page shell">
      <Link className="text-link" to="/#tools">
        <ArrowLeft size={15} /> All tools
      </Link>
      <div className="image-heading">
        <span className="tool-icon green">
          <Image size={25} />
        </span>
        <div>
          <div className="eyebrow">YOUR IMAGE TOOLKIT</div>
          <h1>Image compressor</h1>
          <p>Resize images and make files smaller.</p>
        </div>
      </div>
      <div className="image-body">
        <ImageTools />
      </div>
    </section>
  );
}
