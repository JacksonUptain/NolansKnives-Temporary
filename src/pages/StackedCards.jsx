import { Image, Card, Button } from 'react-bootstrap';
import { Link } from "react-router-dom";

import "./main.css";


function StackedCards({ items }) {
    if (!items || items.length === 0) return null;

    return (
   
        <div className="stacked-cards-wrapper">
            {items.map((item, index) => (
                <Card
                    key={index}
                    className="stacked-card"
                    style={{
                            position: 'sticky',
                            top: `${(index + 1) * 40}px`,
                            border: '3px solid',
                            borderRadius: '12px',
                            borderColor: `hsl(45, 100%, ${40 + index * 12}%)` 
                        }}
                >
                    <div className="stacked-card-text">
                        <h2>{item.title}</h2>
                        <p>{item.text}</p>
                        <Button variant="outline-light" className="stacked-card-button" as={Link} to={item.href} > {item.hrefText} </Button>
                    </div>
                    {item.src && (
                        <Image
                            src={`https://raw.githubusercontent.com/JacksonUptain/nolans-knives-image-database/refs/heads/main/${item.src}`}
                            alt={item.title}
                            className="stacked-card-image"
                            style={{opacity: "1 !important"}}
                        />
                    )}
                </Card>
            ))}
        </div>


         
     
  
    );
}

export default StackedCards;
