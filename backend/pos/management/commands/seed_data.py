"""
Management command: seed_data
Usage: python manage.py seed_data

Seeds the database with:
  - 1 Branch (Naivas Supermarket — Murang'a)
  - 4 Staff users (admin, manager, supervisor, cashier)
  - 12 Product categories
  - 3 Suppliers
  - 80+ real Kenyan supermarket products
  - Inventory for every product
  - 5 Sample customers with loyalty points
  - 1 Sample completed sale

Images are loaded from: D:\\gadaf\\Documents\\images\\naivas
  Any .jpg/.jpeg/.png found there are assigned randomly to products.
  Products with no matching image get no image (graceful fallback).
"""

import os
import random
import shutil
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils.text import slugify
from django.conf import settings
from django.utils import timezone
from django.core.files import File

User = get_user_model()

# ── Image source directory ────────────────────────────────────────────────────
IMAGE_SOURCE_DIR = Path(r"D:\gadaf\Documents\images\naivas")

# ── Seed data ─────────────────────────────────────────────────────────────────

BRANCH = {
    "name": "Naivas Supermarket — Murang'a",
    "code": "NVS-MRG",
    "address": "Murang'a Town Centre, Murang'a County",
    "phone": "0700000001",
}

STAFF = [
    {
        "email": "admin@naivas.co.ke",
        "first_name": "System",
        "last_name": "Administrator",
        "role": "admin",
        "employee_id": "NVS-001",
        "phone": "0712000001",
        "password": "Admin@1234",
    },
    {
        "email": "manager@naivas.co.ke",
        "first_name": "Grace",
        "last_name": "Wanjiku",
        "role": "manager",
        "employee_id": "NVS-002",
        "phone": "0722000002",
        "password": "Manager@1234",
    },
    {
        "email": "supervisor@naivas.co.ke",
        "first_name": "Peter",
        "last_name": "Kamau",
        "role": "supervisor",
        "employee_id": "NVS-003",
        "phone": "0733000003",
        "password": "Supervisor@1234",
    },
    {
        "email": "cashier@naivas.co.ke",
        "first_name": "Mercy",
        "last_name": "Njeri",
        "role": "cashier",
        "employee_id": "NVS-004",
        "phone": "0744000004",
        "password": "Cashier@1234",
    },
    {
        "email": "cashier2@naivas.co.ke",
        "first_name": "James",
        "last_name": "Mwangi",
        "role": "cashier",
        "employee_id": "NVS-005",
        "phone": "0755000005",
        "password": "Cashier@1234",
    },
]

CATEGORIES = [
    {"name": "Fresh Produce",       "icon": "bi-flower1"},
    {"name": "Dairy & Eggs",        "icon": "bi-egg-fried"},
    {"name": "Bakery & Bread",      "icon": "bi-cake"},
    {"name": "Beverages",           "icon": "bi-cup-straw"},
    {"name": "Household & Cleaning","icon": "bi-house-heart"},
    {"name": "Personal Care",       "icon": "bi-person-bounding-box"},
    {"name": "Grains & Cereals",    "icon": "bi-bag"},
    {"name": "Meat & Fish",         "icon": "bi-fire"},
    {"name": "Snacks & Confectionery","icon": "bi-star"},
    {"name": "Cooking Essentials",  "icon": "bi-droplet"},
    {"name": "Baby & Kids",         "icon": "bi-emoji-smile"},
    {"name": "Frozen Foods",        "icon": "bi-snow"},
]

SUPPLIERS = [
    {
        "name": "Unga Group Limited",
        "contact_person": "David Kariuki",
        "phone": "0720111222",
        "email": "supply@unga.co.ke",
        "address": "Industrial Area, Nairobi",
    },
    {
        "name": "Bidco Africa",
        "contact_person": "Sarah Otieno",
        "phone": "0722333444",
        "email": "orders@bidco.co.ke",
        "address": "Thika Road, Ruiru",
    },
    {
        "name": "Brookside Dairy",
        "contact_person": "John Njoroge",
        "phone": "0733555666",
        "email": "trade@brookside.co.ke",
        "address": "Ruiru, Kiambu County",
    },
]

# fmt: (name, category_name, barcode, selling_price, cost_price, unit, tax_rate, is_weighable, min_stock)
PRODUCTS = [
    # ── Fresh Produce ─────────────────────────────────────────────────────────
    ("Tomatoes (Loose)",            "Fresh Produce",  "2000001", 120.00,  80.00,  "kg",    0.0,  True,  20),
    ("Onions (Loose)",              "Fresh Produce",  "2000002", 80.00,   50.00,  "kg",    0.0,  True,  20),
    ("Sukuma Wiki (Kale)",          "Fresh Produce",  "2000003", 30.00,   18.00,  "bunch", 0.0,  False, 30),
    ("Spinach (Mchicha)",           "Fresh Produce",  "2000004", 30.00,   18.00,  "bunch", 0.0,  False, 30),
    ("Carrots (Loose)",             "Fresh Produce",  "2000005", 100.00,  65.00,  "kg",    0.0,  True,  15),
    ("Cabbage (Whole)",             "Fresh Produce",  "2000006", 60.00,   35.00,  "piece", 0.0,  False, 20),
    ("Sweet Peppers (Bell)",        "Fresh Produce",  "2000007", 200.00,  130.00, "kg",    0.0,  True,  10),
    ("Avocado",                     "Fresh Produce",  "2000008", 20.00,   12.00,  "piece", 0.0,  False, 40),
    ("Banana (Cavendish) 1kg",      "Fresh Produce",  "2000009", 80.00,   50.00,  "kg",    0.0,  True,  15),
    ("Mango (Tommy Atkins)",        "Fresh Produce",  "2000010", 50.00,   30.00,  "piece", 0.0,  False, 30),
    ("Watermelon (Whole)",          "Fresh Produce",  "2000011", 280.00,  180.00, "piece", 0.0,  False, 10),
    ("Pineapple (Whole)",           "Fresh Produce",  "2000012", 120.00,  75.00,  "piece", 0.0,  False, 15),
    ("Garlic (Loose)",              "Fresh Produce",  "2000013", 500.00,  320.00, "kg",    0.0,  True,  5),
    ("Ginger (Loose)",              "Fresh Produce",  "2000014", 400.00,  260.00, "kg",    0.0,  True,  5),
    ("Irish Potatoes (Loose)",      "Fresh Produce",  "2000015", 70.00,   45.00,  "kg",    0.0,  True,  25),

    # ── Dairy & Eggs ─────────────────────────────────────────────────────────
    ("Brookside Fresh Milk 500ml",  "Dairy & Eggs",   "3000001", 55.00,   42.00,  "piece", 0.0,  False, 50),
    ("Brookside Fresh Milk 1L",     "Dairy & Eggs",   "3000002", 105.00,  82.00,  "piece", 0.0,  False, 60),
    ("Fresha Yoghurt Strawberry 500ml","Dairy & Eggs","3000003", 115.00,  88.00,  "piece", 0.0,  False, 30),
    ("KCC Butter 250g",             "Dairy & Eggs",   "3000004", 220.00,  170.00, "piece", 16.0, False, 20),
    ("Tuzo UHT Milk 500ml",         "Dairy & Eggs",   "3000005", 65.00,   50.00,  "piece", 0.0,  False, 40),
    ("Daima Flavoured Milk 200ml",  "Dairy & Eggs",   "3000006", 45.00,   33.00,  "piece", 0.0,  False, 60),
    ("Eggs (Tray of 30)",           "Dairy & Eggs",   "3000007", 480.00,  380.00, "tray",  0.0,  False, 20),
    ("Eggs (Single)",               "Dairy & Eggs",   "3000008", 18.00,   13.00,  "piece", 0.0,  False, 100),
    ("Gouda Cheese 200g",           "Dairy & Eggs",   "3000009", 380.00,  290.00, "piece", 16.0, False, 10),
    ("Cream (Elmlea) 250ml",        "Dairy & Eggs",   "3000010", 165.00,  125.00, "piece", 16.0, False, 15),

    # ── Bakery & Bread ────────────────────────────────────────────────────────
    ("Festive White Bread 400g",    "Bakery & Bread", "4000001", 55.00,   42.00,  "piece", 0.0,  False, 40),
    ("Superloaf Brown Bread 400g",  "Bakery & Bread", "4000002", 60.00,   46.00,  "piece", 0.0,  False, 30),
    ("Breadman Chapati x5",         "Bakery & Bread", "4000003", 80.00,   60.00,  "pack",  0.0,  False, 20),
    ("Cream Crackers 200g",         "Bakery & Bread", "4000004", 85.00,   65.00,  "pack",  16.0, False, 25),
    ("Mandazi (12 pack)",           "Bakery & Bread", "4000005", 100.00,  75.00,  "pack",  0.0,  False, 15),

    # ── Beverages ─────────────────────────────────────────────────────────────
    ("Coca-Cola 500ml",             "Beverages",      "5000001", 70.00,   52.00,  "piece", 16.0, False, 60),
    ("Coca-Cola 2L",                "Beverages",      "5000002", 165.00,  125.00, "piece", 16.0, False, 30),
    ("Fanta Orange 500ml",          "Beverages",      "5000003", 70.00,   52.00,  "piece", 16.0, False, 50),
    ("Sprite 500ml",                "Beverages",      "5000004", 70.00,   52.00,  "piece", 16.0, False, 40),
    ("Stoney Tangawizi 500ml",      "Beverages",      "5000005", 70.00,   52.00,  "piece", 16.0, False, 40),
    ("Tusker Lager 500ml",          "Beverages",      "5000006", 230.00,  175.00, "piece", 16.0, False, 30),
    ("Delmonte Juice Mango 500ml",  "Beverages",      "5000007", 95.00,   72.00,  "piece", 16.0, False, 40),
    ("Milo 400g Tin",               "Beverages",      "5000008", 480.00,  370.00, "piece", 16.0, False, 20),
    ("Nescafe Classic 100g",        "Beverages",      "5000009", 580.00,  445.00, "piece", 16.0, False, 15),
    ("Ketepa Pride Tea Bags 100s",  "Beverages",      "5000010", 185.00,  142.00, "piece", 16.0, False, 25),
    ("Quencher Squash Orange 1L",   "Beverages",      "5000011", 155.00,  118.00, "piece", 16.0, False, 20),
    ("Verna Mineral Water 500ml",   "Beverages",      "5000012", 50.00,   35.00,  "piece", 16.0, False, 80),
    ("Kinley Soda Water 300ml",     "Beverages",      "5000013", 55.00,   40.00,  "piece", 16.0, False, 30),

    # ── Grains & Cereals ──────────────────────────────────────────────────────
    ("Jogoo Maize Flour 2kg",       "Grains & Cereals","6000001",145.00,  112.00, "piece", 0.0,  False, 50),
    ("Jogoo Maize Flour 1kg",       "Grains & Cereals","6000002", 80.00,   62.00, "piece", 0.0,  False, 60),
    ("Pembe Wheat Flour 2kg",       "Grains & Cereals","6000003",175.00,  135.00, "piece", 0.0,  False, 40),
    ("Basmati Rice 5kg",            "Grains & Cereals","6000004",750.00,  580.00, "piece", 0.0,  False, 20),
    ("Pishori Rice 2kg",            "Grains & Cereals","6000005",390.00,  300.00, "piece", 0.0,  False, 25),
    ("Brown Ugali Flour 2kg",       "Grains & Cereals","6000006",160.00,  123.00, "piece", 0.0,  False, 30),
    ("Weetabix 430g",               "Grains & Cereals","6000007",320.00,  245.00, "piece", 16.0, False, 20),
    ("Kellogs Cornflakes 500g",     "Grains & Cereals","6000008",430.00,  330.00, "piece", 16.0, False, 15),
    ("Oatmeal Quaker 500g",         "Grains & Cereals","6000009",355.00,  272.00, "piece", 16.0, False, 20),
    ("Green Lentils 500g",          "Grains & Cereals","6000010",120.00,   90.00, "piece", 0.0,  False, 20),
    ("Cowpeas (Kunde) 1kg",         "Grains & Cereals","6000011",185.00,  140.00, "piece", 0.0,  False, 15),

    # ── Cooking Essentials ────────────────────────────────────────────────────
    ("Elianto Cooking Oil 2L",      "Cooking Essentials","7000001",550.00,425.00,"piece", 16.0, False, 30),
    ("Golden Fry Cooking Oil 1L",   "Cooking Essentials","7000002",290.00,220.00,"piece", 16.0, False, 40),
    ("Blueband Margarine 250g",     "Cooking Essentials","7000003",155.00,118.00,"piece", 16.0, False, 30),
    ("Kimbo Cooking Fat 500g",      "Cooking Essentials","7000004",245.00,188.00,"piece", 16.0, False, 25),
    ("Royco Mchuzi Mix 200g",       "Cooking Essentials","7000005",105.00, 80.00,"piece", 16.0, False, 35),
    ("Knorr Chicken Stock 6s",      "Cooking Essentials","7000006", 80.00, 60.00,"piece", 16.0, False, 40),
    ("Ketchup Heinz 570g",          "Cooking Essentials","7000007",295.00,225.00,"piece", 16.0, False, 20),
    ("Nando's Peri Peri Sauce 250ml","Cooking Essentials","7000008",350.00,268.00,"piece",16.0, False, 15),
    ("Iodised Salt 1kg",            "Cooking Essentials","7000009", 55.00, 40.00,"piece",  0.0, False, 50),
    ("White Sugar 2kg",             "Cooking Essentials","7000010",230.00,175.00,"piece",  0.0, False, 40),

    # ── Household & Cleaning ──────────────────────────────────────────────────
    ("Ariel Detergent 2kg",         "Household & Cleaning","8000001",620.00,475.00,"piece",16.0,False,20),
    ("Omo Multiactive 2kg",         "Household & Cleaning","8000002",580.00,445.00,"piece",16.0,False,20),
    ("Jik Bleach 750ml",            "Household & Cleaning","8000003",195.00,148.00,"piece",16.0,False,25),
    ("Domestos Thick Bleach 750ml", "Household & Cleaning","8000004",215.00,163.00,"piece",16.0,False,20),
    ("Fairy Liquid Dish Soap 500ml","Household & Cleaning","8000005",225.00,172.00,"piece",16.0,False,25),
    ("Harpic Toilet Cleaner 500ml", "Household & Cleaning","8000006",280.00,213.00,"piece",16.0,False,20),
    ("Mr. Proper Multipurpose 750ml","Household & Cleaning","8000007",265.00,202.00,"piece",16.0,False,20),
    ("Rubbish Bags (Roll of 20)",   "Household & Cleaning","8000008",155.00,118.00,"piece",16.0,False,30),

    # ── Personal Care ─────────────────────────────────────────────────────────
    ("Colgate Toothpaste 75ml",     "Personal Care",  "9000001",155.00,118.00,"piece", 16.0, False, 30),
    ("Oral-B Toothbrush Medium",    "Personal Care",  "9000002",120.00, 90.00,"piece", 16.0, False, 40),
    ("Safeguard Soap 175g",         "Personal Care",  "9000003", 90.00, 68.00,"piece", 16.0, False, 50),
    ("Dettol Soap 100g",            "Personal Care",  "9000004", 85.00, 64.00,"piece", 16.0, False, 50),
    ("Vaseline Intensive Care 400ml","Personal Care", "9000005",380.00,290.00,"piece", 16.0, False, 20),
    ("Nivea Body Lotion 400ml",     "Personal Care",  "9000006",480.00,368.00,"piece", 16.0, False, 15),
    ("Always Maxi Pads 10s",        "Personal Care",  "9000007",105.00, 80.00,"piece",  0.0, False, 40),
    ("Gillette Blue3 Razors 4s",    "Personal Care",  "9000008",280.00,213.00,"piece", 16.0, False, 20),

    # ── Snacks & Confectionery ────────────────────────────────────────────────
    ("Pringles Original 165g",      "Snacks & Confectionery","1100001",380.00,290.00,"piece",16.0,False,20),
    ("Lays Classic 85g",            "Snacks & Confectionery","1100002",165.00,125.00,"piece",16.0,False,30),
    ("Chocolate Cadbury Dairy Milk 90g","Snacks & Confectionery","1100003",195.00,148.00,"piece",16.0,False,30),
    ("Kit Kat 2-finger 20g",        "Snacks & Confectionery","1100004", 55.00, 40.00,"piece",16.0,False,60),
    ("Orbit Gum Spearmint 14s",     "Snacks & Confectionery","1100005", 90.00, 68.00,"piece",16.0,False,40),
    ("Orbit Gum Spearmint 14s",     "Snacks & Confectionery","1100005", 90.00, 68.00,"piece",16.0,False,40),
    ("Naks Peanuts Salted 100g",    "Snacks & Confectionery","1100006", 75.00, 55.00,"piece",16.0,False,50),
    ("Digestive Biscuits McVities 400g","Snacks & Confectionery","1100007",285.00,218.00,"piece",16.0,False,20),

    # ── Meat & Fish ───────────────────────────────────────────────────────────
    ("Chicken Whole (Kenchic)",     "Meat & Fish",    "1200001",550.00, 430.00,"piece",  0.0, False, 15),
    ("Beef Mince 500g",             "Meat & Fish",    "1200002",380.00, 290.00,"piece",  0.0, False, 20),
    ("Tilapia Fish (Fresh, Loose)", "Meat & Fish",    "1200003",350.00, 270.00,"kg",     0.0, True,  10),
    ("Sausages Farmer's Choice 500g","Meat & Fish",   "1200004",295.00, 225.00,"piece",  0.0, False, 20),
    ("Tuna Canned John West 185g",  "Meat & Fish",    "1200005",195.00, 148.00,"piece",  0.0, False, 30),

    # ── Baby & Kids ───────────────────────────────────────────────────────────
    ("Pampers Active Baby Size 3 (44s)","Baby & Kids","1300001",950.00, 730.00,"piece",  0.0, False, 15),
    ("Nan Pro 1 Baby Formula 400g", "Baby & Kids",    "1300002",1250.00,960.00,"piece",  0.0, False, 10),
    ("Cerelac Wheat 400g",          "Baby & Kids",    "1300003",480.00, 368.00,"piece",  0.0, False, 15),
    ("Johnson Baby Shampoo 200ml",  "Baby & Kids",    "1300004",280.00, 213.00,"piece",  0.0, False, 20),

    # ── Frozen Foods ──────────────────────────────────────────────────────────
    ("Goldenfields Fries 1kg",      "Frozen Foods",   "1400001",380.00, 290.00,"piece", 16.0, False, 10),
    ("Kenchic Chicken Strips 500g", "Frozen Foods",   "1400002",420.00, 322.00,"piece",  0.0, False, 10),
    ("Peas (Frozen) 500g",          "Frozen Foods",   "1400003",180.00, 135.00,"piece",  0.0, False, 15),
]

CUSTOMERS = [
    {
        "first_name": "Alice",
        "last_name": "Wambui",
        "phone": "254712100001",
        "email": "alice.wambui@gmail.com",
        "loyalty_points": 1250,
        "loyalty_card_number": "NVS-LYL-0001",
    },
    {
        "first_name": "Brian",
        "last_name": "Otieno",
        "phone": "254722200002",
        "email": "brian.otieno@yahoo.com",
        "loyalty_points": 530,
        "loyalty_card_number": "NVS-LYL-0002",
    },
    {
        "first_name": "Catherine",
        "last_name": "Muthoni",
        "phone": "254733300003",
        "email": "",
        "loyalty_points": 200,
        "loyalty_card_number": "NVS-LYL-0003",
    },
    {
        "first_name": "Daniel",
        "last_name": "Kipchoge",
        "phone": "254744400004",
        "email": "d.kipchoge@gmail.com",
        "loyalty_points": 3800,
        "loyalty_card_number": "NVS-LYL-0004",
    },
    {
        "first_name": "Esther",
        "last_name": "Akinyi",
        "phone": "254755500005",
        "email": "esther.a@hotmail.com",
        "loyalty_points": 75,
        "loyalty_card_number": "NVS-LYL-0005",
    },
]


class Command(BaseCommand):
    help = "Seed the database with real Naivas supermarket demo data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing seed data before inserting",
        )

    def handle(self, *args, **options):
        from pos.models import (
            Branch, Category, Supplier, Product,
            Inventory, Customer, Sale, SaleItem, LoyaltyTransaction,
        )

        self.stdout.write(self.style.MIGRATE_HEADING("\n╔══════════════════════════════════╗"))
        self.stdout.write(self.style.MIGRATE_HEADING("║   NaivasPOS — Data Seeder        ║"))
        self.stdout.write(self.style.MIGRATE_HEADING("╚══════════════════════════════════╝\n"))

        if options["clear"]:
            self.stdout.write("  Clearing existing data...")
            SaleItem.objects.all().delete()
            Sale.objects.all().delete()
            LoyaltyTransaction.objects.all().delete()
            Inventory.objects.all().delete()
            Product.objects.all().delete()
            Customer.objects.all().delete()
            Category.objects.all().delete()
            Supplier.objects.all().delete()
            User.objects.filter(email__endswith="@naivas.co.ke").delete()
            Branch.objects.filter(code="NVS-MRG").delete()
            self.stdout.write(self.style.WARNING("  ✓ Existing data cleared\n"))

        # ── 1. Load images ────────────────────────────────────────────────────
        image_files = self._collect_images()
        self.stdout.write(f"  📷 Found {len(image_files)} images in source directory\n")

        # ── 2. Branch ─────────────────────────────────────────────────────────
        branch, created = Branch.objects.get_or_create(
            code=BRANCH["code"],
            defaults=BRANCH,
        )
        status = "created" if created else "exists"
        self.stdout.write(self.style.SUCCESS(f"  ✓ Branch: {branch.name} ({status})"))

        # ── 3. Staff ──────────────────────────────────────────────────────────
        self.stdout.write("\n  Creating staff users...")
        created_users = {}
        for s in STAFF:
            pw = s.pop("password")
            user, created = User.objects.get_or_create(
                email=s["email"],
                defaults={**s, "branch": branch, "is_staff": s["role"] == "admin"},
            )
            if created:
                user.set_password(pw)
                user.save()
                self.stdout.write(self.style.SUCCESS(f"    ✓ {user.role.upper():12} {user.email}  pw: {pw}"))
            else:
                self.stdout.write(f"    – {user.role.upper():12} {user.email} (already exists)")
            created_users[user.role] = user
            s["password"] = pw  # restore for idempotency

        # ── 4. Categories ─────────────────────────────────────────────────────
        self.stdout.write("\n  Creating categories...")
        cat_map = {}
        for c in CATEGORIES:
            slug = slugify(c["name"])
            cat, created = Category.objects.get_or_create(
                slug=slug,
                defaults={"name": c["name"], "icon": c["icon"], "is_active": True},
            )
            cat_map[c["name"]] = cat
            mark = "✓" if created else "–"
            self.stdout.write(f"    {mark} {cat.name}")

        # ── 5. Suppliers ──────────────────────────────────────────────────────
        self.stdout.write("\n  Creating suppliers...")
        sup_list = []
        for s in SUPPLIERS:
            sup, created = Supplier.objects.get_or_create(
                name=s["name"],
                defaults=s,
            )
            sup_list.append(sup)
            mark = "✓" if created else "–"
            self.stdout.write(f"    {mark} {sup.name}")

        # ── 6. Products ───────────────────────────────────────────────────────
        self.stdout.write("\n  Creating products...")
        seen_barcodes = set()
        created_products = []

        for row in PRODUCTS:
            name, cat_name, barcode, sell, cost, unit, tax, weighable, min_stock = row

            # Skip duplicate barcodes within seed data
            if barcode in seen_barcodes:
                continue
            seen_barcodes.add(barcode)

            category = cat_map.get(cat_name)
            supplier = random.choice(sup_list)

            product, created = Product.objects.get_or_create(
                barcode=barcode,
                defaults={
                    "name": name,
                    "category": category,
                    "supplier": supplier,
                    "selling_price": Decimal(str(sell)),
                    "cost_price": Decimal(str(cost)),
                    "tax_rate": Decimal(str(tax)),
                    "unit": unit,
                    "is_weighable": weighable,
                    "min_stock_level": min_stock,
                    "is_active": True,
                    "allow_discount": True,
                },
            )

            if created:
                # Assign a random image if available
                if image_files:
                    img_path = random.choice(image_files)
                    self._attach_image(product, img_path)

                self.stdout.write(self.style.SUCCESS(f"    ✓ {name[:50]:50}  KES {sell:>8,.2f}"))
            else:
                self.stdout.write(f"    – {name[:50]:50}  (exists)")

            created_products.append(product)

        # ── 7. Inventory ──────────────────────────────────────────────────────
        self.stdout.write("\n  Seeding inventory...")
        inv_created = 0
        for product in created_products:
            qty = random.randint(product.min_stock_level + 5, product.min_stock_level + 150)
            _, created = Inventory.objects.get_or_create(
                product=product,
                branch=branch,
                defaults={"quantity": Decimal(str(qty))},
            )
            if created:
                inv_created += 1
        self.stdout.write(self.style.SUCCESS(f"    ✓ {inv_created} inventory records created"))

        # ── 8. Customers ──────────────────────────────────────────────────────
        self.stdout.write("\n  Creating customers...")
        created_customers = []
        for c in CUSTOMERS:
            customer, created = Customer.objects.get_or_create(
                phone=c["phone"],
                defaults={
                    "first_name": c["first_name"],
                    "last_name": c["last_name"],
                    "email": c["email"],
                    "loyalty_points": c["loyalty_points"],
                    "loyalty_card_number": c["loyalty_card_number"],
                    "is_active": True,
                },
            )
            created_customers.append(customer)
            mark = "✓" if created else "–"
            self.stdout.write(
                f"    {mark} {customer.full_name:20}  {customer.phone}  "
                f"Points: {customer.loyalty_points}"
            )

        # ── 9. Sample sale ────────────────────────────────────────────────────
        self.stdout.write("\n  Creating sample completed sale...")
        cashier = created_users.get("cashier") or User.objects.filter(role="cashier").first()

        if cashier and created_products and created_customers:
            sample_items = random.sample(
                [p for p in created_products if not p.is_weighable],
                min(4, len(created_products))
            )
            customer = created_customers[0]

            subtotal = Decimal("0")
            sale = Sale.objects.create(
                branch=branch,
                cashier=cashier,
                customer=customer,
                payment_method=Sale.CASH,
                status=Sale.COMPLETED,
                completed_at=timezone.now(),
            )

            for product in sample_items:
                qty = Decimal("1")
                tax_amt = (product.selling_price * product.tax_rate) / (100 + product.tax_rate)
                line = product.selling_price * qty
                SaleItem.objects.create(
                    sale=sale,
                    product=product,
                    quantity=qty,
                    unit_price=product.selling_price,
                    tax_rate=product.tax_rate,
                    tax_amount=tax_amt,
                    discount_amount=Decimal("0"),
                    line_total=line,
                )
                subtotal += line

            tax_total = sum(
                (i.unit_price * i.tax_rate) / (100 + i.tax_rate)
                for i in sale.items.all()
            )
            points_earned = int(float(subtotal))

            sale.subtotal = subtotal
            sale.tax_total = tax_total
            sale.total_amount = subtotal
            sale.amount_paid = subtotal
            sale.change_given = Decimal("0")
            sale.points_earned = points_earned
            sale.save()

            # Award points to customer
            customer.loyalty_points += points_earned
            customer.total_spent += subtotal
            customer.save()

            LoyaltyTransaction.objects.create(
                customer=customer,
                sale=sale,
                transaction_type=LoyaltyTransaction.EARN,
                points=points_earned,
                balance_after=customer.loyalty_points,
                created_by=cashier,
                notes="Seeded sample sale",
            )

            self.stdout.write(
                self.style.SUCCESS(
                    f"    ✓ Receipt: {sale.receipt_number}  "
                    f"Total: KES {sale.total_amount:,.2f}  "
                    f"Items: {sale.items.count()}  "
                    f"Customer: {customer.full_name}"
                )
            )

        # ── Summary ───────────────────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n╔══════════════════════════════════╗"))
        self.stdout.write(self.style.MIGRATE_HEADING("║         Seed Complete!            ║"))
        self.stdout.write(self.style.MIGRATE_HEADING("╚══════════════════════════════════╝"))
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"  Branches   : {Branch.objects.count()}"))
        self.stdout.write(self.style.SUCCESS(f"  Staff users: {User.objects.filter(email__endswith='@naivas.co.ke').count()}"))
        self.stdout.write(self.style.SUCCESS(f"  Categories : {Category.objects.count()}"))
        self.stdout.write(self.style.SUCCESS(f"  Suppliers  : {Supplier.objects.count()}"))
        self.stdout.write(self.style.SUCCESS(f"  Products   : {Product.objects.count()}"))
        self.stdout.write(self.style.SUCCESS(f"  Inventory  : {Inventory.objects.count()} records"))
        self.stdout.write(self.style.SUCCESS(f"  Customers  : {Customer.objects.count()}"))
        self.stdout.write(self.style.SUCCESS(f"  Sales      : {Sale.objects.count()}"))
        self.stdout.write("")
        self.stdout.write("  Login credentials:")
        self.stdout.write(self.style.WARNING("  ┌─────────────────────────────────────────────────────┐"))
        self.stdout.write(self.style.WARNING("  │  admin@naivas.co.ke        Admin@1234               │"))
        self.stdout.write(self.style.WARNING("  │  manager@naivas.co.ke      Manager@1234             │"))
        self.stdout.write(self.style.WARNING("  │  supervisor@naivas.co.ke   Supervisor@1234          │"))
        self.stdout.write(self.style.WARNING("  │  cashier@naivas.co.ke      Cashier@1234             │"))
        self.stdout.write(self.style.WARNING("  └─────────────────────────────────────────────────────┘"))
        self.stdout.write("")

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _collect_images(self):
        """Return list of image Paths found in IMAGE_SOURCE_DIR."""
        if not IMAGE_SOURCE_DIR.exists():
            self.stdout.write(
                self.style.WARNING(
                    f"  ⚠  Image directory not found: {IMAGE_SOURCE_DIR}\n"
                    "     Products will be created without images.\n"
                    "     Create the directory or update IMAGE_SOURCE_DIR in seed_data.py"
                )
            )
            return []
        exts = {".jpg", ".jpeg", ".png", ".webp"}
        images = [p for p in IMAGE_SOURCE_DIR.iterdir() if p.suffix.lower() in exts]
        if not images:
            self.stdout.write(
                self.style.WARNING(
                    f"  ⚠  No image files (.jpg/.png) found in {IMAGE_SOURCE_DIR}"
                )
            )
        return images

    def _attach_image(self, product, img_path: Path):
        """Copy an image file into Django's MEDIA_ROOT and attach to product."""
        try:
            with open(img_path, "rb") as f:
                django_file = File(f, name=img_path.name)
                product.image.save(img_path.name, django_file, save=True)
        except Exception as e:
            self.stdout.write(
                self.style.WARNING(f"      ⚠  Could not attach image {img_path.name}: {e}")
            )