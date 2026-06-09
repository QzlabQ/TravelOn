package org.microarchitecturovisco.reservationservice.domain.exceptions;

public class PurchaseFailedException extends RuntimeException{
    public PurchaseFailedException() {
        super("支付未通过，请检查银联卡号或换用其他支付方式。");
    }

    public PurchaseFailedException(String message) {
        super("支付未通过，请检查银联卡号或换用其他支付方式。");
    }
}
