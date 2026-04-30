import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { useOperationsData, DocumentEntityType } from "../../lib/operations-data";
import { FileSearch } from "lucide-react";

type AssociatedDocumentsDialogProps = {
  entityType: DocumentEntityType;
  entityId: string;
  title: string;
  buttonLabel?: string;
};

export function AssociatedDocumentsDialog({
  entityType,
  entityId,
  title,
  buttonLabel = "Ver documentos",
}: AssociatedDocumentsDialogProps) {
  const { documents } = useOperationsData();
  const docs = documents.filter((doc) => doc.entityType === entityType && doc.entityId === entityId);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileSearch className="mr-2 h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {docs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No hay documentos asociados.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p>{doc.documentType}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.fileName} · {doc.fileSizeKb} KB · vence {new Date(doc.expiresAt).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                  <Badge variant={doc.status === "Vigente" ? "success" : doc.status === "Próximo a vencer" ? "warning" : "destructive"}>
                    {doc.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

