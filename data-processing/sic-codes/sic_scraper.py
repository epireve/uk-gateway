import requests
from bs4 import BeautifulSoup
import csv
import re


def scrape_sic_codes():
    """
    Scrape SIC codes from Companies House website and save to CSV
    """
    # URL for Companies House SIC codes
    url = "https://resources.companieshouse.gov.uk/sic/"

    print("Fetching SIC codes from Companies House website...")

    try:
        response = requests.get(url)
        html_content = response.text

        # Parse the HTML content
        soup = BeautifulSoup(html_content, "html.parser")

        # Find the table containing SIC codes
        table = soup.find("table")
        if not table:
            print(
                "Could not find the SIC codes table. Page structure may have changed."
            )
            return

        # Define SIC code ranges for each section based on UK SIC 2007 standard
        section_ranges = {
            "Section A": (1110, 3220),  # Agriculture, Forestry and Fishing
            "Section B": (5101, 9900),  # Mining and Quarrying
            "Section C": (10110, 33200),  # Manufacturing
            "Section D": (
                35110,
                35300,
            ),  # Electricity, Gas, Steam and Air Conditioning Supply
            "Section E": (36000, 39000),  # Water Supply, Sewerage, Waste Management
            "Section F": (41100, 43999),  # Construction
            "Section G": (45111, 47990),  # Wholesale and Retail Trade
            "Section H": (49100, 53202),  # Transportation and Storage
            "Section I": (55100, 56302),  # Accommodation and Food Service Activities
            "Section J": (58110, 63990),  # Information and Communication
            "Section K": (64110, 66300),  # Financial and Insurance Activities
            "Section L": (68100, 68320),  # Real Estate Activities
            "Section M": (
                69101,
                75000,
            ),  # Professional, Scientific and Technical Activities
            "Section N": (
                77110,
                82990,
            ),  # Administrative and Support Service Activities
            "Section O": (84110, 84300),  # Public Administration and Defence
            "Section P": (85100, 85600),  # Education
            "Section Q": (86101, 88990),  # Human Health and Social Work Activities
            "Section R": (90010, 93290),  # Arts, Entertainment and Recreation
            "Section S": (94110, 96090),  # Other Service Activities
            "Section T": (97000, 98200),  # Activities of Households as Employers
            "Section U": (99000, 99999),  # Activities of Extraterritorial Organisations
        }

        # Section titles
        section_titles = {
            "Section A": "Agriculture, Forestry and Fishing",
            "Section B": "Mining and Quarrying",
            "Section C": "Manufacturing",
            "Section D": "Electricity, Gas, Steam and Air Conditioning Supply",
            "Section E": "Water Supply, Sewerage, Waste Management and Remediation Activities",
            "Section F": "Construction",
            "Section G": "Wholesale and Retail Trade; Repair of Motor Vehicles and Motorcycles",
            "Section H": "Transportation and Storage",
            "Section I": "Accommodation and Food Service Activities",
            "Section J": "Information and Communication",
            "Section K": "Financial and Insurance Activities",
            "Section L": "Real Estate Activities",
            "Section M": "Professional, Scientific and Technical Activities",
            "Section N": "Administrative and Support Service Activities",
            "Section O": "Public Administration and Defence; Compulsory Social Security",
            "Section P": "Education",
            "Section Q": "Human Health and Social Work Activities",
            "Section R": "Arts, Entertainment and Recreation",
            "Section S": "Other Service Activities",
            "Section T": "Activities of Households as Employers",
            "Section U": "Activities of Extraterritorial Organisations and Bodies",
        }

        # Function to determine section based on SIC code
        def get_section_for_code(sic_code):
            try:
                code_num = int(sic_code)
                for section, (min_code, max_code) in section_ranges.items():
                    if min_code <= code_num <= max_code:
                        return section, section_titles[section]
                # Default if not found in any range
                return "Unclassified", "Unclassified"
            except ValueError:
                # If the code can't be converted to an integer, it's not a valid SIC code
                return "Unclassified", "Unclassified"

        # Initialize variables to store the data
        sic_data = []

        # Process the table rows to extract SIC codes
        rows = table.find_all("tr")

        for row in rows:
            # Extract SIC code and description from td elements
            cells = row.find_all("td")
            if len(cells) == 2:
                sic_code = cells[0].text.strip()
                description = cells[1].text.strip()

                # Skip any header rows, empty rows, or section headers in table cells
                if not sic_code or "Section" in sic_code or len(sic_code) > 10:
                    continue

                # Determine section for this code
                section, section_title = get_section_for_code(sic_code)

                # Add the data to our list
                sic_data.append(
                    {
                        "sic_code": sic_code,
                        "description": description,
                        "section": section,
                        "section_title": section_title,
                    }
                )

                # Debug: print progress periodically
                if len(sic_data) % 50 == 0:
                    print(f"Processed {len(sic_data)} SIC codes so far...")

        # Check if we have valid data
        if not sic_data:
            print("No SIC codes were found. The page structure might have changed.")
            return

        # Count sections for verification
        section_counts = {}
        for data in sic_data:
            section = data["section"]
            section_counts[section] = section_counts.get(section, 0) + 1

        print("\nSIC codes by section:")
        for section, count in section_counts.items():
            print(f"{section}: {count} codes")

        # Write the data to a CSV file
        with open("sic_codes.csv", "w", newline="", encoding="utf-8") as csvfile:
            fieldnames = ["sic_code", "description", "section", "section_title"]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

            writer.writeheader()
            for data in sic_data:
                writer.writerow(data)

        print(
            f"\nSuccessfully scraped {len(sic_data)} SIC codes and saved to sic_codes.csv"
        )

    except requests.exceptions.RequestException as e:
        print(f"Error fetching the webpage: {e}")
    except Exception as e:
        print(f"Error processing the data: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    scrape_sic_codes()
