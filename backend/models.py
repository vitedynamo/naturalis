from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ----- User -----
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    phone: str
    name: str
    password_hash: str
    wallet_balance: float = 0.0
    total_earnings: float = 0.0
    referral_earnings: float = 0.0
    referral_code: str
    referred_by: Optional[str] = None  # user id of direct referrer
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    is_admin: bool = False
    is_blocked: bool = False
    created_at: datetime = Field(default_factory=_now)


class UserPublic(BaseModel):
    id: str
    phone: str
    name: str
    wallet_balance: float
    total_earnings: float
    referral_earnings: float
    referral_code: str
    referred_by: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    is_admin: bool = False
    created_at: datetime


class RegisterRequest(BaseModel):
    phone: str
    name: str
    password: str
    referral_code: Optional[str] = None


class LoginRequest(BaseModel):
    phone: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class BankUpdateRequest(BaseModel):
    bank_name: str
    account_number: str
    account_name: str


# ----- Product -----
class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    name: str
    description: str = ""
    image_url: str = ""
    price: float
    daily_profit_percent: float
    duration_days: int
    min_amount: float = 0
    max_amount: float = 0  # 0 means no cap
    is_active: bool = True
    created_at: datetime = Field(default_factory=_now)


class ProductCreate(BaseModel):
    name: str
    description: str = ""
    image_url: str = ""
    price: float
    daily_profit_percent: float
    duration_days: int
    min_amount: float = 0
    max_amount: float = 0
    is_active: bool = True


# ----- Investment -----
class Investment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    user_id: str
    product_id: str
    product_name: str
    amount: float
    daily_profit_percent: float
    daily_profit_amount: float
    duration_days: int
    days_paid: int = 0
    total_profit_paid: float = 0.0
    status: str = "active"  # active | completed
    last_payout_at: datetime = Field(default_factory=_now)
    started_at: datetime = Field(default_factory=_now)
    completed_at: Optional[datetime] = None


class InvestRequest(BaseModel):
    product_id: str
    amount: float


# ----- Deposit -----
class Deposit(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    user_id: str
    amount: float
    reference: str
    method: str = "paystack"  # paystack | mock
    status: str = "pending"  # pending | success | failed
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class DepositInitRequest(BaseModel):
    amount: float
    callback_url: Optional[str] = None


# ----- Withdrawal -----
class Withdrawal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    user_id: str
    amount: float
    bank_name: str
    account_number: str
    account_name: str
    method: str = "manual"  # manual | auto
    status: str = "pending"  # pending | approved | rejected | paid
    admin_note: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class WithdrawRequest(BaseModel):
    amount: float
    method: str = "manual"  # manual | auto


class AdminWithdrawalAction(BaseModel):
    note: Optional[str] = None


# ----- Transaction -----
class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    user_id: str
    type: str  # deposit | withdrawal | invest | profit | referral | bonus | coupon | refund
    amount: float  # positive = credit, negative = debit
    description: str = ""
    balance_after: float = 0.0
    meta: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_now)


# ----- Referral -----
class Referral(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    referrer_id: str
    referred_id: str
    generation: int  # 1, 2, or 3
    created_at: datetime = Field(default_factory=_now)


# ----- Coupon -----
class Coupon(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    code: str
    amount: float
    max_uses: int = 1
    used_count: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=_now)


class CouponCreate(BaseModel):
    code: str
    amount: float
    max_uses: int = 1
    is_active: bool = True


class CouponRedeemRequest(BaseModel):
    code: str


class CouponRedemption(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    coupon_id: str
    user_id: str
    code: str
    amount: float
    created_at: datetime = Field(default_factory=_now)


# ----- Settings -----
class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "global"
    welcome_bonus: float = 750.0
    min_deposit: float = 3000.0
    min_withdrawal: float = 1000.0
    gen1_percent: float = 10.0
    gen2_percent: float = 5.0
    gen3_percent: float = 2.0
    paystack_public_key: str = ""
    paystack_secret_key: str = ""
    payment_mode: str = "mock"  # mock | live


class SettingsUpdate(BaseModel):
    welcome_bonus: Optional[float] = None
    min_deposit: Optional[float] = None
    min_withdrawal: Optional[float] = None
    gen1_percent: Optional[float] = None
    gen2_percent: Optional[float] = None
    gen3_percent: Optional[float] = None
    paystack_public_key: Optional[str] = None
    paystack_secret_key: Optional[str] = None
    payment_mode: Optional[str] = None
