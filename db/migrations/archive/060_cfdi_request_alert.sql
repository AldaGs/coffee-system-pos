-- 4.5: push/Telegram alert when a customer requests a factura (CFDI). Reuses the
-- order-alert pipeline (same hook URL + secret); fires when cfdi_status becomes 'requested'.
CREATE OR REPLACE FUNCTION public.notify_cfdi_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NEW.cfdi_status = 'requested' AND OLD.cfdi_status IS DISTINCT FROM 'requested' THEN
    SELECT hook_url, hook_secret INTO v_url, v_secret FROM public.order_alerts WHERE id = 1 AND enabled;
    IF v_url IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(url := v_url, body := jsonb_build_object('cfdi_sale_id', NEW.id, 'secret', v_secret),
          headers := '{"Content-Type": "application/json"}'::jsonb);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_cfdi_request() FROM PUBLIC;
DROP TRIGGER IF EXISTS sales_cfdi_notify ON public.sales;
CREATE TRIGGER sales_cfdi_notify AFTER UPDATE OF cfdi_status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.notify_cfdi_request();
