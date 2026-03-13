import asyncio
from pathlib import Path

from sqlalchemy import create_engine, text

from app.config import settings
from app.services.fuel_ingestion import (
    build_price_rows,
    build_upsert_queries,
    fetch_fuel_xml,
    parse_station_xml,
)


def load_schema(connection) -> None:
    schema_path = Path(__file__).resolve().parents[1] / "app" / "db" / "schema.sql"
    statements = [
        statement.strip()
        for statement in schema_path.read_text(encoding="utf-8").split(";")
        if statement.strip()
    ]
    for statement in statements:
        connection.exec_driver_sql(statement)


async def main() -> None:
    xml_payload = await fetch_fuel_xml(settings.fuel_data_url)
    stations = parse_station_xml(xml_payload)

    if not stations:
        raise RuntimeError("Aucune station n'a ete parsee depuis le flux officiel.")

    engine = create_engine(settings.database_url)

    with engine.begin() as connection:
        load_schema(connection)

        station_query, station_params = build_upsert_queries(stations)
        connection.execute(text(station_query), station_params)

        price_upsert = text(
            """
            INSERT INTO fuel_prices (station_id, fuel_type, price, updated_at)
            VALUES (:station_id, :fuel_type, :price, :updated_at)
            ON CONFLICT (station_id, fuel_type) DO UPDATE SET
                price = EXCLUDED.price,
                updated_at = EXCLUDED.updated_at;
            """
        )
        connection.execute(price_upsert, build_price_rows(stations))

    print(f"{len(stations)} stations synchronisees.")


if __name__ == "__main__":
    asyncio.run(main())
