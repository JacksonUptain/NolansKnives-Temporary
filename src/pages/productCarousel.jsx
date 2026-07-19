import { Carousel, CarouselItem } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

function ProductCarousel({ items }) {
    if (!items || items.length === 0) {
        return null; // Render nothing if there are no items
    }
    
    return (

        <Carousel
            style={{
                backgroundColor: "black",
                top: "0px",
                width: "100%",
                
            }}
            >
            {items.map((item, index) => (
                <CarouselItem key={index} interval={4000}>
                <img
                    className="d-block w-100 h-100"
                    src={item}
                    alt={item}
                />
                
                </CarouselItem>
            ))}
        </Carousel>


    );
}

export default ProductCarousel;
