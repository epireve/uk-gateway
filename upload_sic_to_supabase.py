#!/usr/bin/env python
import csv
import os
import time
import json
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

if not supabase_url or not supabase_key:
    print("Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set")
    print("Please create a .env file with the required variables")
    exit(1)

print(f"Connecting to Supabase at: {supabase_url}")
try:
    supabase: Client = create_client(supabase_url, supabase_key)
    print("Connected to Supabase successfully")
    # Check supabase client version
    import supabase as supabase_module

    print(f"Supabase Python client version: {supabase_module.__version__}")
except Exception as e:
    print(f"Error connecting to Supabase: {str(e)}")
    exit(1)


def check_table_exists():
    """
    Check if the sic_codes table exists in Supabase
    """
    try:
        # Query for a single record to check if table exists
        response = supabase.from_("sic_codes").select("*").limit(1).execute()
        print("Table 'sic_codes' exists and is accessible.")
        return True
    except Exception as e:
        print(
            f"Error: Table 'sic_codes' might not exist or is not accessible: {str(e)}"
        )
        return False


def upload_sic_codes_to_supabase():
    """
    Read SIC codes from CSV and upload them to Supabase
    """
    print("Starting SIC code upload to Supabase...")

    # First check if table exists
    if not check_table_exists():
        print(
            "\nPlease run the create_sic_table.sql script in Supabase SQL Editor first."
        )
        print("Instructions are in the SUPABASE_UPLOAD_README.md file.")
        sys.exit(1)

    try:
        # Open and read the CSV file
        with open("sic_codes.csv", "r", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            records = list(reader)

            # Process records in batches to avoid request size limits
            batch_size = 50  # Reduced batch size
            total_records = len(records)

            print(f"Found {total_records} SIC codes to upload")

            successful_batches = 0
            failed_batches = 0

            # Process in batches
            for i in range(0, total_records, batch_size):
                batch = records[i : i + batch_size]
                current_batch = i // batch_size + 1
                total_batches = (total_records + batch_size - 1) // batch_size
                print(f"Uploading batch {current_batch}/{total_batches}")

                # Prepare data for upload
                data_to_upload = []
                for record in batch:
                    data_to_upload.append(
                        {
                            "sic_code": record["sic_code"],
                            "description": record["description"],
                            "section": record["section"],
                            "section_title": record["section_title"],
                        }
                    )

                try:
                    # Upload to Supabase with explicit on_conflict handling
                    response = (
                        supabase.from_("sic_codes")
                        .upsert(
                            data_to_upload,
                            on_conflict="sic_code",  # Specify the conflict field
                        )
                        .execute()
                    )

                    # Inspect the response
                    if hasattr(response, "error") and response.error:
                        print(
                            f"Error uploading batch {current_batch}: {response.error}"
                        )
                        failed_batches += 1
                    else:
                        # Print response details
                        print(f"Batch {current_batch} uploaded successfully.")
                        # Try to print information from the response if available
                        if hasattr(response, "data"):
                            print(
                                f"Records processed: {len(response.data) if response.data else 0}"
                            )
                        else:
                            # Try to access response as a dict
                            response_dict = getattr(response, "__dict__", {})
                            print(
                                f"Response info: {json.dumps(response_dict, default=str)[:200]}..."
                            )

                        successful_batches += 1

                except Exception as batch_error:
                    print(f"Error uploading batch {current_batch}: {str(batch_error)}")
                    print(
                        f"Batch details: {json.dumps(data_to_upload[0])} (first record sample)"
                    )
                    failed_batches += 1

                # Avoid rate limiting
                time.sleep(1)

            print("\nUpload summary:")
            print(f"Total batches: {total_batches}")
            print(f"Successful batches: {successful_batches}")
            print(f"Failed batches: {failed_batches}")

            if failed_batches == 0:
                print("\nUpload completed successfully!")
            else:
                print(f"\nUpload completed with {failed_batches} failed batches.")

    except Exception as e:
        print(f"Error during upload: {str(e)}")
        import traceback

        traceback.print_exc()
        exit(1)


if __name__ == "__main__":
    upload_sic_codes_to_supabase()
