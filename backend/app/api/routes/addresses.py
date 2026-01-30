from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.repositories.utils import resolve_store
from app.repositories.customers import get_or_create_customer_for_user
from app.repositories.addresses import list_addresses, create_address, update_address, delete_address
from app.schemas.address import AddressCreate, AddressUpdate, AddressOut
from app.models.user import User

router = APIRouter(prefix="/addresses")


@router.get("", response_model=list[AddressOut])
def get_addresses(
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    user = db.get(User, user_out.id)
    customer = get_or_create_customer_for_user(db, store_id=store.id, user=user)

    rows = list_addresses(db, store_id=store.id, customer_id=customer.id)
    return [AddressOut.model_validate(r) for r in rows]


@router.post("", response_model=AddressOut)
def add_address(
    payload: AddressCreate,
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    user = db.get(User, user_out.id)
    customer = get_or_create_customer_for_user(db, store_id=store.id, user=user)

    data = payload.model_dump(exclude={"customer_id"}, exclude_none=True)
    a = create_address(db, store_id=store.id, customer_id=customer.id, data=data)
    return AddressOut.model_validate(a)


@router.patch("/{address_id}", response_model=AddressOut)
def edit_address(
    address_id: int,
    payload: AddressUpdate,
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    user = db.get(User, user_out.id)
    customer = get_or_create_customer_for_user(db, store_id=store.id, user=user)

    a = update_address(
        db,
        store_id=store.id,
        customer_id=customer.id,
        address_id=address_id,
        data=payload.model_dump(exclude_none=True),
    )
    if not a:
        raise HTTPException(status_code=404, detail="Address not found")
    return AddressOut.model_validate(a)


@router.delete("/{address_id}")
def remove_address(
    address_id: int,
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    user = db.get(User, user_out.id)
    customer = get_or_create_customer_for_user(db, store_id=store.id, user=user)

    ok = delete_address(db, store_id=store.id, customer_id=customer.id, address_id=address_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Address not found")
    return {"ok": True}
