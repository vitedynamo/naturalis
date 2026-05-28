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
    # Security questions (for self-service password recovery)
    security_question_1: Optional[str] = None
    security_answer_hash_1: Optional[str] = None
    security_question_2: Optional[str] = None
    security_answer_hash_2: Optional[str] = None
    # Withdrawal PIN (4-digit). Stored as bcrypt hash. Required for every withdrawal.
    withdrawal_pin_hash: Optional[str] = None
    withdrawal_pin_failed: int = 0
    withdrawal_pin_locked_until: Optional[str] = None
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
    security_question_1: Optional[str] = None
    security_answer_1: Optional[str] = None
    security_question_2: Optional[str] = None
    security_answer_2: Optional[str] = None


class ResetWithQuestionsRequest(BaseModel):
    phone: str
    answer_1: str
    answer_2: str
    new_password: str


class LoginRequest(BaseModel):
    phone: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class BankUpdateRequest(BaseModel):
    bank_name: str
    bank_code: Optional[str] = ""
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
    gateway: Optional[str] = None  # paystack | nomba | marasoft — honoured only when multi_gateway_enabled + let_users_choose_gateway


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
    pin: Optional[str] = None  # 4-digit withdrawal PIN


class SetWithdrawalPinRequest(BaseModel):
    pin: str  # 4-digit
    password: str  # account password — re-auth to set/change PIN


class ChangeWithdrawalPinRequest(BaseModel):
    old_pin: str
    new_pin: str


class ResetWithdrawalPinRequest(BaseModel):
    answer_1: str
    answer_2: str
    new_pin: str


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
    expires_at: Optional[datetime] = None
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


class CouponCreate(BaseModel):
    code: str
    amount: float
    max_uses: int = 1
    is_active: bool = True
    expires_at: Optional[str] = None  # ISO-8601 or None
    note: Optional[str] = Field(None, max_length=200)


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


# ----- Password reset request -----
class ForgotPasswordRequest(BaseModel):
    phone: str
    new_password: str
    reason: Optional[str] = None


class PasswordResetActionRequest(BaseModel):
    note: Optional[str] = None

# ----- In-app Announcements (multi-row pop-ups) -----
class Announcement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    title: str
    message: str
    style: str = "info"  # info | success | warning | critical
    cta_type: str = "none"  # none | internal | external
    cta_label: Optional[str] = None
    cta_url: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    hide_from_newcomers_hours: int = 0
    reshow_interval_minutes: int = 0
    priority: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    message: str = Field(..., min_length=1, max_length=2000)
    style: str = "info"
    cta_type: str = "none"
    cta_label: Optional[str] = Field(None, max_length=40)
    cta_url: Optional[str] = Field(None, max_length=400)
    starts_at: Optional[str] = None  # ISO
    ends_at: Optional[str] = None    # ISO
    hide_from_newcomers_hours: int = 0
    reshow_interval_minutes: int = 0
    priority: int = 0
    is_active: bool = True




# ----- Settings -----
class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "global"
    welcome_bonus: float = 750.0
    min_deposit: float = 3000.0
    min_withdrawal: float = 1000.0
    gen1_percent: float = 10.0
    gen2_percent: float = 5.0
    paystack_public_key: str = ""
    paystack_secret_key: str = ""
    nomba_client_id: str = ""
    nomba_client_secret: str = ""
    nomba_account_id: str = ""
    nomba_environment: str = "sandbox"  # sandbox | production
    marasoft_public_key: str = ""
    marasoft_secret_key: str = ""
    marasoft_encryption_key: str = ""
    marasoft_secret_hash: str = ""  # webhook auth — set in Marasoft dashboard + here
    # Merchant identity used to create Marasoft reserved (virtual) accounts.
    # Required by Marasoft KYC — every reserved account is opened in the merchant's name.
    marasoft_first_name: str = ""
    marasoft_last_name: str = ""
    marasoft_bvn: str = ""
    marasoft_dob: str = ""  # format: '01 September 1998'
    deposit_gateway: str = "paystack"  # paystack | nomba | marasoft — primary/default pick when no multi-gateway
    payout_gateway: str = "paystack"   # paystack | nomba
    # Individual gateway on/off toggles. Used when multi_gateway_enabled is ON so admins can
    # selectively expose providers to users. The "primary" deposit_gateway above must also
    # be enabled to be valid. Defaults match the historical single-gateway behaviour.
    gateway_paystack_enabled: bool = True
    gateway_nomba_enabled: bool = True
    gateway_marasoft_enabled: bool = True
    payment_mode: str = "mock"  # mock | live
    featured_product_id: Optional[str] = None
    home_announcement: str = ""
    home_announcement_active: bool = False
    home_announcement_image_url: str = ""
    telegram_url: str = ""
    welcome_message: str = ""
    welcome_modal_title: str = ""
    welcome_modal_active: bool = True
    auto_payout_enabled: bool = True
    withdrawals_open: bool = True
    withdrawal_start_time: str = "00:00"
    withdrawal_end_time: str = "23:59"
    # ===== Newly added (iteration 52) =====
    # Deposits
    deposit_bonus_percent: float = 0.0
    deposit_bonus_limit_per_user: float = 0.0  # 0 = unlimited
    transfer_description_template: str = "Evoque-Nova deposit"
    multi_gateway_enabled: bool = False
    let_users_choose_gateway: bool = False
    quick_deposit_amounts: list = Field(default_factory=lambda: [3000, 5000, 10000, 25000, 50000, 100000])
    # Withdrawals
    require_withdrawal_pin: bool = True
    max_withdrawal: float = 1000000.0
    auto_payout_max_amount: float = 0.0  # 0 = no cap; above this, manual approval required
    # Daily claim
    daily_claim_enabled: bool = False
    daily_claim_amount: float = 100.0
    # Home / social
    telegram_channel_url: str = ""
    telegram_group_url: str = ""
    whatsapp_channel_url: str = ""
    whatsapp_group_url: str = ""
    # Referral commission mode (image-driven design):
    #   first_only — pay commission ONLY on the referred user's first investment (legacy)
    #   unlimited  — pay commission on EVERY investment the referred user makes
    #   capped     — pay commission on the FIRST N investments only
    referral_commission_mode: str = "first_only"
    referral_commission_cap_n: int = 3
    # Branding — uploaded via Admin Settings → Branding tab. When empty, the static logo
    # at /evoque-nova-logo.png is used. Drives sidebar/login badges and favicon.
    brand_logo_url: str = ""
    # Home: show/hide the Featured Plan hero on the user dashboard. When False,
    # the entire featured plan + 3 CTA grid is hidden.
    home_featured_plan_enabled: bool = True
    # Home: customizable section under the featured plan
    home_below_featured_mode: str = "cards"  # cards | image
    home_below_featured_image_url: str = ""


class SettingsUpdate(BaseModel):
    welcome_bonus: Optional[float] = None
    min_deposit: Optional[float] = None
    min_withdrawal: Optional[float] = None
    gen1_percent: Optional[float] = None
    gen2_percent: Optional[float] = None
    paystack_public_key: Optional[str] = None
    paystack_secret_key: Optional[str] = None
    nomba_client_id: Optional[str] = None
    nomba_client_secret: Optional[str] = None
    nomba_account_id: Optional[str] = None
    nomba_environment: Optional[str] = None  # sandbox | production
    marasoft_public_key: Optional[str] = None
    marasoft_secret_key: Optional[str] = None
    marasoft_encryption_key: Optional[str] = None
    marasoft_secret_hash: Optional[str] = None
    marasoft_first_name: Optional[str] = None
    marasoft_last_name: Optional[str] = None
    marasoft_bvn: Optional[str] = None
    marasoft_dob: Optional[str] = None
    deposit_gateway: Optional[str] = None
    payout_gateway: Optional[str] = None
    payment_mode: Optional[str] = None
    featured_product_id: Optional[str] = None
    home_announcement: Optional[str] = None
    home_announcement_active: Optional[bool] = None
    home_announcement_image_url: Optional[str] = None
    telegram_url: Optional[str] = None
    welcome_message: Optional[str] = None
    welcome_modal_title: Optional[str] = None
    welcome_modal_active: Optional[bool] = None
    auto_payout_enabled: Optional[bool] = None
    withdrawals_open: Optional[bool] = None
    withdrawal_start_time: Optional[str] = None
    withdrawal_end_time: Optional[str] = None
    # Newly added
    deposit_bonus_percent: Optional[float] = None
    deposit_bonus_limit_per_user: Optional[float] = None
    transfer_description_template: Optional[str] = None
    multi_gateway_enabled: Optional[bool] = None
    let_users_choose_gateway: Optional[bool] = None
    quick_deposit_amounts: Optional[list] = None
    require_withdrawal_pin: Optional[bool] = None
    max_withdrawal: Optional[float] = None
    auto_payout_max_amount: Optional[float] = None
    daily_claim_enabled: Optional[bool] = None
    daily_claim_amount: Optional[float] = None
    telegram_channel_url: Optional[str] = None
    telegram_group_url: Optional[str] = None
    whatsapp_channel_url: Optional[str] = None
    whatsapp_group_url: Optional[str] = None
    gateway_paystack_enabled: Optional[bool] = None
    gateway_nomba_enabled: Optional[bool] = None
    gateway_marasoft_enabled: Optional[bool] = None
    referral_commission_mode: Optional[str] = None  # first_only | unlimited | capped
    referral_commission_cap_n: Optional[int] = None
    brand_logo_url: Optional[str] = None
    home_featured_plan_enabled: Optional[bool] = None
    home_below_featured_mode: Optional[str] = None  # cards | image
    home_below_featured_image_url: Optional[str] = None


class PaystackPayRequest(BaseModel):
    bank_code: str
    reason: Optional[str] = None


# ----- Admin Activity Log -----
class AdminActivity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    admin_id: str
    admin_phone: str = ""
    admin_name: str = ""
    action: str  # e.g. 'pin.cleared', 'withdrawal.approved', 'settings.updated'
    target_type: Optional[str] = None  # 'user' | 'withdrawal' | 'deposit' | 'settings' | 'product' | 'coupon'
    target_id: Optional[str] = None
    description: str = ""
    meta: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_now)
